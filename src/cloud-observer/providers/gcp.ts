import { GoogleAuth } from "google-auth-library";
import type { AppEnv } from "../../config/env";
import type { CapabilityResult, CloudProviderAdapter } from "../types";

type GcpFetch = (url: string, init?: RequestInit) => Promise<Response>;

export function createGcpProvider(env: AppEnv, options: { fetch?: GcpFetch; auth?: GoogleAuth } = {}): CloudProviderAdapter {
  const projectId = env.GCP_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) return unavailable("GCP_PROJECT_ID is not configured");
  const auth = options.auth ?? new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform.read-only"] });
  const fetcher = options.fetch ?? fetch;
  return {
    provider: "GCP",
    async collect(capability, observedAt, signal): Promise<CapabilityResult> {
      try {
        if (capability === "infrastructure") return await collectInfrastructure(projectId, auth, fetcher, observedAt, signal);
        if (capability === "cost") return { status: "UNAVAILABLE", error: "GCP project cost requires a configured Cloud Billing export; M1 does not create BigQuery infrastructure", cost: unknownCost(projectId, observedAt) };
        return { status: "UNAVAILABLE", error: "GCP promotional credit remaining is not exposed by the configured supported API", credits: [{ provider: "GCP", accountId: projectId, creditType: "promotional", currency: null, originalAmount: null, remainingAmount: null, estimatedRemainingAmount: null, expiration: null, valueStatus: "UNKNOWN", observedAt, providerDataAsOf: null, freshness: "UNAVAILABLE" }] };
      } catch (error) {
        return { status: /401|403|unauthorized|permission/i.test(safeError(error)) ? "UNAUTHORIZED" : "ERROR", error: safeError(error) };
      }
    },
  };
}

async function collectInfrastructure(projectId: string, auth: GoogleAuth, fetcher: GcpFetch, observedAt: Date, signal?: AbortSignal): Promise<CapabilityResult> {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw new Error("GCP access token unavailable");
  const response = await fetcher(`https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId)}/aggregated/instances`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok) throw new Error(`GCP Compute API ${response.status}`);
  const body = await response.json() as { items?: Record<string, { instances?: Array<{ id?: string; name?: string; zone?: string; status?: string; machineType?: string }> }> };
  const cpuByInstance = new Map<string, number>();
  try {
    const end = observedAt.toISOString();
    const start = new Date(observedAt.getTime() - 15 * 60_000).toISOString();
    const params = new URLSearchParams({
      filter: 'metric.type="compute.googleapis.com/instance/cpu/utilization" AND resource.type="gce_instance"',
      "interval.endTime": end,
      "interval.startTime": start,
      view: "FULL",
    });
    const metrics = await fetcher(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (metrics.ok) {
      const metricBody = await metrics.json() as { timeSeries?: Array<{ resource?: { labels?: { instance_id?: string } }; points?: Array<{ value?: { doubleValue?: number } }> }> };
      for (const series of metricBody.timeSeries ?? []) {
        const id = series.resource?.labels?.instance_id;
        const value = series.points?.[0]?.value?.doubleValue;
        if (id && value !== undefined) cpuByInstance.set(id, value * 100);
      }
    }
  } catch {
    // Instance identity remains useful when optional monitoring is unavailable.
  }
  const resources = Object.values(body.items ?? {}).flatMap((group) => (group.instances ?? []).map((instance) => ({
    provider: "GCP" as const, accountId: projectId, resourceId: instance.id ?? instance.name ?? "unknown", resourceType: "compute_instance",
    region: instance.zone?.split("/").at(-1) ?? null, status: instance.status ?? "UNKNOWN", cpuUtilization: instance.id ? cpuByInstance.get(instance.id) ?? null : null,
    memoryUtilization: null, diskUtilization: null, networkInBytes: null, networkOutBytes: null, observedAt,
    providerDataAsOf: observedAt, freshness: "AVAILABLE" as const, metadata: { name: instance.name ?? "unknown", machineType: instance.machineType ?? "unknown" },
  })));
  return { status: "AVAILABLE", resources, providerDataAsOf: observedAt };
}

function unknownCost(projectId: string, observedAt: Date) { return { provider: "GCP" as const, accountId: projectId, currency: null, monthToDateGrossCost: null, creditsApplied: null, monthToDateNetCost: null, dailyBurnRate: null, projectedMonthEnd: null, valueStatus: { gross: "UNKNOWN" as const, creditsApplied: "UNKNOWN" as const, net: "UNKNOWN" as const, dailyBurnRate: "UNKNOWN" as const, projectedMonthEnd: "UNKNOWN" as const }, observedAt, providerDataAsOf: null, freshness: "UNAVAILABLE" as const }; }
function unavailable(error: string): CloudProviderAdapter { return { provider: "GCP", async collect() { return { status: "UNAVAILABLE", error }; } }; }
function safeError(error: unknown) { return (error instanceof Error ? error.message : "GCP provider request failed").slice(0, 300); }
