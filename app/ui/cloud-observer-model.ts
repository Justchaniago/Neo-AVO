export type CloudObserverStatus = "AVAILABLE" | "DELAYED" | "UNAVAILABLE" | "UNKNOWN" | "STALE" | "UNAUTHORIZED" | "ERROR";
export type FinancialStatus = "ACTUAL" | "ESTIMATED" | "DELAYED" | "UNKNOWN";

export type CloudResource = {
  provider: "AWS" | "GCP";
  accountId: string;
  resourceId: string;
  resourceType: string;
  region: string | null;
  status: string;
  cpuUtilization: number | null;
  observedAt: string;
  providerDataAsOf: string | null;
  freshness: CloudObserverStatus;
  metadata: Record<string, string | number | boolean>;
};

export type CloudCost = {
  provider: "AWS" | "GCP";
  accountId: string;
  currency: string | null;
  monthToDateGrossCost: number | null;
  creditsApplied: number | null;
  monthToDateNetCost: number | null;
  dailyBurnRate: number | null;
  projectedMonthEnd: number | null;
  breakdown?: { services: Record<string, number>; projects: Record<string, number> };
  valueStatus: Record<string, FinancialStatus>;
  observedAt: string;
  providerDataAsOf: string | null;
  freshness: CloudObserverStatus;
};

export type CloudCredit = {
  provider: "AWS" | "GCP";
  accountId: string;
  creditType: string;
  currency: string | null;
  remainingAmount: number | null;
  estimatedRemainingAmount: number | null;
  valueStatus: FinancialStatus;
  observedAt: string;
  freshness: CloudObserverStatus;
};

export type CloudObserverState = {
  provider: "AWS" | "GCP";
  capability: "infrastructure" | "cost" | "credits";
  status: CloudObserverStatus;
  lastAttemptAt: string;
  lastSuccessAt: string | null;
  providerDataAsOf: string | null;
};

export type CloudObserverData = {
  resources: CloudResource[];
  costs: CloudCost[];
  credits: CloudCredit[];
  state: CloudObserverState[];
};

export function stateFor(data: CloudObserverData, provider: "AWS" | "GCP", capability: CloudObserverState["capability"]): CloudObserverState | undefined {
  return data.state.find((item) => item.provider === provider && item.capability === capability);
}

export function normalizeObserverStatus(status?: string | null): CloudObserverStatus {
  if (status === "AVAILABLE" || status === "DELAYED" || status === "STALE" || status === "UNAVAILABLE" || status === "UNKNOWN") return status;
  if (status === "ERROR" || status === "UNAUTHORIZED") return "UNAVAILABLE";
  return "UNKNOWN";
}

/** Current capability state wins; a snapshot can only refine AVAILABLE. */
export function capabilityStatus(data: CloudObserverData, provider: "AWS" | "GCP", capability: CloudObserverState["capability"], snapshotStatus?: string | null): CloudObserverStatus {
  const current = normalizeObserverStatus(stateFor(data, provider, capability)?.status);
  if (current === "UNAVAILABLE" || current === "STALE" || current === "DELAYED") return current;
  if (current === "AVAILABLE") {
    const snapshot = normalizeObserverStatus(snapshotStatus);
    return snapshot === "STALE" || snapshot === "DELAYED" || snapshot === "UNAVAILABLE" ? snapshot : "AVAILABLE";
  }
  return normalizeObserverStatus(snapshotStatus);
}

export function capabilityObservedAt(data: CloudObserverData, provider: "AWS" | "GCP", capability: CloudObserverState["capability"], snapshotObservedAt?: string | null) {
  return snapshotObservedAt ?? stateFor(data, provider, capability)?.providerDataAsOf ?? stateFor(data, provider, capability)?.lastAttemptAt ?? null;
}

export function resourcesFor(data: CloudObserverData, provider: "AWS" | "GCP") {
  return data.resources.filter((item) => item.provider === provider);
}

export function costFor(data: CloudObserverData, provider: "AWS" | "GCP") {
  return data.costs.find((item) => item.provider === provider);
}

export function creditFor(data: CloudObserverData, provider: "AWS" | "GCP") {
  return data.credits.find((item) => item.provider === provider);
}

export function formatMetric(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value}${suffix}` : "Unknown";
}

export function formatMoney(value: number | null | undefined, currency: string | null | undefined, unavailableLabel = "Waiting for billing data") {
  if (typeof value !== "number" || !Number.isFinite(value)) return unavailableLabel;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 6 }).format(value);
}

export function financialDisplay(cost: CloudCost | undefined, key: keyof Pick<CloudCost, "monthToDateGrossCost" | "creditsApplied" | "monthToDateNetCost" | "dailyBurnRate" | "projectedMonthEnd">, unavailableLabel = "Waiting for billing data") {
  const value = cost?.[key];
  const statusKey = key === "monthToDateGrossCost" ? "gross" : key === "monthToDateNetCost" ? "net" : key;
  const status = cost?.valueStatus?.[statusKey] ?? "UNKNOWN";
  if (typeof value !== "number" || !Number.isFinite(value) || status === "UNKNOWN") return { text: unavailableLabel, status };
  return { text: formatMoney(value, cost?.currency), status };
}

export function creditDisplay(credit: CloudCredit | undefined) {
  if (!credit) return { text: "Unknown", status: "UNKNOWN" as FinancialStatus };
  if (credit.valueStatus === "ESTIMATED" && credit.estimatedRemainingAmount !== null) return { text: formatMoney(credit.estimatedRemainingAmount, credit.currency), status: "ESTIMATED" as FinancialStatus };
  if (credit.valueStatus === "ACTUAL" && credit.remainingAmount !== null) return { text: formatMoney(credit.remainingAmount, credit.currency), status: "ACTUAL" as FinancialStatus };
  if (credit.valueStatus === "DELAYED" && credit.remainingAmount !== null) return { text: formatMoney(credit.remainingAmount, credit.currency), status: "DELAYED" as FinancialStatus };
  return { text: "Unknown", status: credit.valueStatus };
}

export function serviceBreakdown(cost: CloudCost | undefined) {
  return Object.entries(cost?.breakdown?.services ?? {}).filter(([, value]) => typeof value === "number" && Number.isFinite(value));
}
