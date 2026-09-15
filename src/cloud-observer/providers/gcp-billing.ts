import { GoogleAuth } from "google-auth-library";
import { deriveMonthEndProjection } from "../finops";
import type { CapabilityResult, CloudCostSnapshot, CloudCreditSnapshot, FinancialStatus } from "../types";

export const GCP_BIGQUERY_READ_SCOPE = "https://www.googleapis.com/auth/bigquery.readonly";

export type GcpBillingConfig = {
  billingProjectId: string;
  dataset: string;
  table: string;
  creditAllocation?: number;
  auth?: GoogleAuth;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
};

type BillingRow = { usageDate: string; service: string; project: string; gross: number; credits: number | null };

export async function collectGcpBilling(config: GcpBillingConfig, capability: "cost" | "credits", observedAt: Date, signal?: AbortSignal): Promise<CapabilityResult> {
  try {
    const rows = await queryBillingRows(config, observedAt, signal);
    if (!rows.length) return unavailable("GCP billing export returned no rows for the requested period", config.billingProjectId, observedAt, capability);
    const summary = summarize(rows, config, observedAt);
    if (capability === "cost") return { status: "AVAILABLE", providerDataAsOf: summary.providerDataAsOf, cost: summary.cost };
    return { status: "AVAILABLE", providerDataAsOf: summary.providerDataAsOf, credits: [summary.credit] };
  } catch (error) {
    return { status: classifyBillingError(error), error: safeError(error) };
  }
}

async function queryBillingRows(config: GcpBillingConfig, observedAt: Date, signal?: AbortSignal): Promise<BillingRow[]> {
  assertIdentifier(config.billingProjectId, "billing project");
  assertIdentifier(config.dataset, "billing dataset");
  assertIdentifier(config.table, "billing table");
  const auth = config.auth ?? new GoogleAuth({ scopes: [GCP_BIGQUERY_READ_SCOPE] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw new Error("GCP BigQuery access token unavailable");
  const now = observedAt.toISOString();
  const start = new Date(Date.UTC(observedAt.getUTCFullYear(), observedAt.getUTCMonth(), 1)).toISOString();
  const query = `SELECT
  DATE(usage_start_time) AS usage_date,
  COALESCE(service.description, 'UNKNOWN') AS service_description,
  COALESCE(project.id, 'UNKNOWN') AS project_id,
  SUM(CAST(cost AS NUMERIC)) AS gross_cost,
  SUM(IF(credits IS NULL, NULL, COALESCE((SELECT SUM(CAST(credit.amount AS NUMERIC)) FROM UNNEST(credits) AS credit), 0))) AS credits_applied
FROM \`${config.billingProjectId}.${config.dataset}.${config.table}\`
WHERE usage_start_time >= @start_time AND usage_start_time < @end_time
GROUP BY usage_date, service_description, project_id`;
  const endpoint = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(config.billingProjectId)}/queries`;
  const fetcher = config.fetch ?? fetch;
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query, useLegacySql: false, timeoutMs: config.timeoutMs ?? 10_000, maxResults: 10_000,
      parameterMode: "NAMED", queryParameters: [
        { name: "start_time", parameterType: { type: "TIMESTAMP" }, parameterValue: { value: start } },
        { name: "end_time", parameterType: { type: "TIMESTAMP" }, parameterValue: { value: now } },
      ],
    }), signal,
  });
  const body = await response.json() as { error?: { message?: string }; jobComplete?: boolean; pageToken?: string; rows?: Array<{ f?: Array<{ v?: unknown }> }> };
  if (!response.ok) throw new Error(body.error?.message ?? `GCP BigQuery API ${response.status}`);
  if (body.error) throw new Error(body.error.message ?? "GCP BigQuery query failed");
  if (body.jobComplete === false) throw new Error("GCP BigQuery query timed out");
  if (body.pageToken) throw new Error("GCP BigQuery result exceeded bounded page size");
  return (body.rows ?? []).map((row) => {
    const fields = row.f ?? [];
    const usageDate = String(fields[0]?.v ?? "");
    const service = String(fields[1]?.v ?? "UNKNOWN");
    const project = String(fields[2]?.v ?? "UNKNOWN");
    const gross = Number(fields[3]?.v);
    const creditsValue = fields[4]?.v;
    const credits = creditsValue === null || creditsValue === undefined || creditsValue === "" ? null : Number(creditsValue);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(usageDate) || !Number.isFinite(gross) || (credits !== null && !Number.isFinite(credits))) throw new Error("GCP billing export returned an invalid numeric row");
    return { usageDate, service, project, gross, credits };
  });
}

function summarize(rows: BillingRow[], config: GcpBillingConfig, observedAt: Date): { cost: CloudCostSnapshot; credit: CloudCreditSnapshot; providerDataAsOf: Date } {
  const gross = roundMoney(rows.reduce((sum, row) => sum + row.gross, 0));
  const creditValues = rows.map((row) => row.credits).filter((value): value is number => value !== null);
  const credits = creditValues.length ? roundMoney(creditValues.reduce((sum, value) => sum + value, 0)) : null;
  const net = credits === null ? null : roundMoney(gross + credits);
  const services: Record<string, number> = {};
  const projects: Record<string, number> = {};
  const daily = new Map<string, number>();
  for (const row of rows) {
    services[row.service] = roundMoney((services[row.service] ?? 0) + row.gross);
    projects[row.project] = roundMoney((projects[row.project] ?? 0) + row.gross);
    daily.set(row.usageDate, roundMoney((daily.get(row.usageDate) ?? 0) + row.gross));
  }
  const latestDate = rows.map((row) => row.usageDate).sort().at(-1)!;
  const providerDataAsOf = new Date(`${latestDate}T23:59:59.999Z`);
  const delayed = latestDate < new Date(observedAt.getTime() - 24 * 60 * 60_000).toISOString().slice(0, 10);
  const projection = deriveMonthEndProjection({ monthToDateGrossCost: gross, creditsApplied: credits, monthToDateNetCost: net, recentDailyCosts: [...daily.values()].slice(-7), sourceStatus: delayed ? "DELAYED" : "ACTUAL", now: observedAt });
  const valueStatus: Record<string, FinancialStatus> = { ...projection.valueStatus, net: net === null ? "UNKNOWN" : delayed ? "DELAYED" : "ACTUAL" };
  return {
    providerDataAsOf,
    cost: { provider: "GCP", accountId: config.billingProjectId, currency: "USD", monthToDateGrossCost: gross, creditsApplied: credits, monthToDateNetCost: net, ...projection, valueStatus, breakdown: { services, projects }, observedAt, providerDataAsOf, freshness: delayed ? "STALE" : "AVAILABLE" },
    credit: { provider: "GCP", accountId: config.billingProjectId, creditType: "billing_export", currency: "USD", originalAmount: config.creditAllocation ?? null, remainingAmount: null, estimatedRemainingAmount: config.creditAllocation === undefined || credits === null ? null : roundMoney(Math.max(0, config.creditAllocation + credits)), expiration: null, valueStatus: config.creditAllocation === undefined || credits === null ? "UNKNOWN" : "ESTIMATED", observedAt, providerDataAsOf, freshness: delayed ? "STALE" : "AVAILABLE" },
  };
}

function unavailable(error: string, accountId: string, observedAt: Date, capability: "cost" | "credits"): CapabilityResult {
  if (capability === "cost") return { status: "UNAVAILABLE", error, cost: { provider: "GCP", accountId, currency: "USD", monthToDateGrossCost: null, creditsApplied: null, monthToDateNetCost: null, dailyBurnRate: null, projectedMonthEnd: null, valueStatus: { gross: "UNKNOWN", creditsApplied: "UNKNOWN", net: "UNKNOWN", dailyBurnRate: "UNKNOWN", projectedMonthEnd: "UNKNOWN" }, breakdown: { services: {}, projects: {} }, observedAt, providerDataAsOf: null, freshness: "UNAVAILABLE" } };
  return { status: "UNAVAILABLE", error, credits: [{ provider: "GCP", accountId, creditType: "billing_export", currency: "USD", originalAmount: null, remainingAmount: null, estimatedRemainingAmount: null, expiration: null, valueStatus: "UNKNOWN", observedAt, providerDataAsOf: null, freshness: "UNAVAILABLE" }] };
}

function assertIdentifier(value: string, label: string) { if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Invalid ${label}`); }
function roundMoney(value: number) { return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000; }
function classifyBillingError(error: unknown): "UNAUTHORIZED" | "ERROR" { return /401|403|unauthorized|permission/i.test(safeError(error)) ? "UNAUTHORIZED" : "ERROR"; }
function safeError(error: unknown) { return (error instanceof Error ? error.message : "GCP BigQuery request failed").slice(0, 300); }
