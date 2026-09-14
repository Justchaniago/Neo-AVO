import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { GetInstanceMetricDataCommand, GetInstancesCommand, LightsailClient } from "@aws-sdk/client-lightsail";
import type { AppEnv } from "../../config/env";
import { deriveMonthEndProjection } from "../finops";
import type { CapabilityResult, CloudProviderAdapter, CloudResourceSnapshot } from "../types";

type AwsClients = { lightsail: Pick<LightsailClient, "send">; cost: Pick<CostExplorerClient, "send"> };

export function createAwsProvider(env: AppEnv, clients?: AwsClients): CloudProviderAdapter {
  if (!env.AWS_REGION) return unavailable("AWS_REGION is not configured");
  const awsClients = clients ?? {
    lightsail: new LightsailClient({ region: env.AWS_REGION }),
    cost: new CostExplorerClient({ region: "us-east-1" }),
  };
  const accountId = env.AWS_ACCOUNT_ID ?? "unknown";
  return {
    provider: "AWS",
    async collect(capability, observedAt, signal): Promise<CapabilityResult> {
      try {
        if (capability === "infrastructure") return await collectInfrastructure(awsClients.lightsail, accountId, env.AWS_REGION!, observedAt, signal);
        if (capability === "cost") return await collectCost(awsClients.cost, accountId, observedAt, signal);
        return { status: "UNAVAILABLE", error: "AWS promotional credit remaining is not exposed by the configured supported read APIs", credits: [{ provider: "AWS", accountId, creditType: "promotional", currency: null, originalAmount: null, remainingAmount: null, estimatedRemainingAmount: null, expiration: null, valueStatus: "UNKNOWN", observedAt, providerDataAsOf: null, freshness: "UNAVAILABLE" }] };
      } catch (error) {
        return { status: classifyAwsError(error), error: safeError(error) };
      }
    },
  };
}

async function collectInfrastructure(client: Pick<LightsailClient, "send">, accountId: string, region: string, observedAt: Date, signal?: AbortSignal): Promise<CapabilityResult> {
  const response = await client.send(new GetInstancesCommand({}), { abortSignal: signal });
  const resources: CloudResourceSnapshot[] = [];
  for (const instance of response.instances ?? []) {
    if (!instance.name) continue;
    const metric = await client.send(new GetInstanceMetricDataCommand({ instanceName: instance.name, metricName: "CPUUtilization", period: 300, startTime: new Date(observedAt.getTime() - 15 * 60_000), endTime: observedAt, unit: "Percent", statistics: ["Average"] }), { abortSignal: signal });
    const point = metric.metricData?.at(-1);
    resources.push({
      provider: "AWS", accountId, resourceId: instance.arn ?? instance.name, resourceType: "lightsail_instance",
      region: instance.location?.regionName ?? region, status: instance.state?.name ?? "UNKNOWN", cpuUtilization: point?.average ?? null,
      memoryUtilization: null, diskUtilization: null, networkInBytes: null, networkOutBytes: null, observedAt,
      providerDataAsOf: point?.timestamp ?? null, freshness: "AVAILABLE",
      metadata: { name: instance.name, bundleId: instance.bundleId ?? "unknown", blueprintId: instance.blueprintId ?? "unknown" },
    });
  }
  return { status: "AVAILABLE", resources, providerDataAsOf: observedAt };
}

async function collectCost(client: Pick<CostExplorerClient, "send">, accountId: string, observedAt: Date, signal?: AbortSignal): Promise<CapabilityResult> {
  const start = new Date(Date.UTC(observedAt.getUTCFullYear(), observedAt.getUTCMonth(), 1));
  const end = new Date(Date.UTC(observedAt.getUTCFullYear(), observedAt.getUTCMonth(), observedAt.getUTCDate() + 1));
  const response = await client.send(new GetCostAndUsageCommand({ TimePeriod: { Start: isoDate(start), End: isoDate(end) }, Granularity: "DAILY", Metrics: ["UnblendedCost", "NetUnblendedCost"] }), { abortSignal: signal });
  const results = response.ResultsByTime ?? [];
  const creditResponse = await client.send(new GetCostAndUsageCommand({ TimePeriod: { Start: isoDate(start), End: isoDate(end) }, Granularity: "DAILY", Metrics: ["UnblendedCost"], Filter: { Dimensions: { Key: "RECORD_TYPE", Values: ["Credit"] } } }), { abortSignal: signal });
  const creditResults = creditResponse.ResultsByTime ?? [];
  const gross = sumMetric(results, "UnblendedCost");
  const net = sumMetric(results, "NetUnblendedCost");
  const credits = sumMetric(creditResults, "UnblendedCost");
  const dailyCosts = results.slice(-7).map((result) => Number(result.Total?.UnblendedCost?.Amount)).filter(Number.isFinite);
  const delayed = results.some((result) => result.Estimated === true);
  const projection = deriveMonthEndProjection({ monthToDateGrossCost: gross, creditsApplied: credits, monthToDateNetCost: net, recentDailyCosts: dailyCosts, sourceStatus: delayed ? "DELAYED" : "ACTUAL", now: observedAt });
  return { status: "AVAILABLE", providerDataAsOf: observedAt, cost: { provider: "AWS", accountId, currency: results[0]?.Total?.UnblendedCost?.Unit ?? "USD", monthToDateGrossCost: gross, creditsApplied: credits, monthToDateNetCost: net, ...projection, observedAt, providerDataAsOf: observedAt, freshness: "AVAILABLE" } };
}

function sumMetric(results: Array<{ Total?: Record<string, { Amount?: string }> }>, metric: string) {
  const values = results.map((result) => Number(result.Total?.[metric]?.Amount)).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function unavailable(error: string): CloudProviderAdapter { return { provider: "AWS", async collect() { return { status: "UNAVAILABLE", error }; } }; }
function classifyAwsError(error: unknown): "UNAUTHORIZED" | "ERROR" { return /accessdenied|unauthorized|invalidclienttoken|credentials/i.test(safeError(error)) ? "UNAUTHORIZED" : "ERROR"; }
function safeError(error: unknown) { return (error instanceof Error ? error.message : "AWS provider request failed").slice(0, 300); }
