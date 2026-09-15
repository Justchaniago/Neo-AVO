import { describe, expect, it } from "vitest";

import {
  costFor,
  capabilityObservedAt,
  capabilityStatus,
  creditDisplay,
  financialDisplay,
  formatMetric,
  formatMoney,
  normalizeObserverStatus,
  resourcesFor,
  serviceBreakdown,
  stateFor,
  type CloudObserverData,
} from "../app/ui/cloud-observer-model";

const data: CloudObserverData = {
  resources: [{
    provider: "AWS", accountId: "527137870433", resourceId: "lightsail-1", resourceType: "lightsail_instance", region: "ap-southeast-1", status: "running", cpuUtilization: 22.9078,
    observedAt: "2026-09-15T00:00:00.000Z", providerDataAsOf: "2026-09-15T00:00:00.000Z", freshness: "AVAILABLE", metadata: { name: "shared-prod-01" },
  }],
  costs: [{
    provider: "AWS", accountId: "527137870433", currency: "USD", monthToDateGrossCost: null, creditsApplied: null, monthToDateNetCost: null, dailyBurnRate: null, projectedMonthEnd: null,
    valueStatus: { gross: "UNKNOWN" }, observedAt: "2026-09-15T00:00:00.000Z", providerDataAsOf: null, freshness: "UNAVAILABLE",
  }],
  credits: [],
  state: [
    { provider: "AWS", capability: "infrastructure", status: "AVAILABLE", lastAttemptAt: "2026-09-15T00:00:00.000Z", lastSuccessAt: "2026-09-15T00:00:00.000Z", providerDataAsOf: "2026-09-15T00:00:00.000Z" },
    { provider: "GCP", capability: "infrastructure", status: "AVAILABLE", lastAttemptAt: "2026-09-15T00:00:00.000Z", lastSuccessAt: "2026-09-15T00:00:00.000Z", providerDataAsOf: "2026-09-15T00:00:00.000Z" },
  ],
};

describe("Cloud Observer Infrastructure UI model", () => {
  it("preserves fractional CPU values", () => {
    expect(formatMetric(resourcesFor(data, "AWS")[0].cpuUtilization, "%")).toBe("22.9078%");
  });

  it("does not turn null financial values into zero", () => {
    expect(formatMoney(data.costs[0].monthToDateGrossCost, "USD")).toBe("Waiting for billing data");
    expect(formatMoney(null, "USD", "Unknown")).toBe("Unknown");
    expect(formatMoney(null, "USD")).not.toContain("$0");
  });

  it("keeps provider states independent and supports zero-resource GCP", () => {
    expect(stateFor(data, "AWS", "infrastructure")?.status).toBe("AVAILABLE");
    expect(resourcesFor(data, "GCP")).toHaveLength(0);
    const gcpFailure = { ...data, state: [...data.state, { provider: "GCP" as const, capability: "cost" as const, status: "ERROR" as const, lastAttemptAt: "2026-09-15T00:01:00.000Z", lastSuccessAt: null, providerDataAsOf: null }] };
    expect(capabilityStatus(gcpFailure, "AWS", "infrastructure", "AVAILABLE")).toBe("AVAILABLE");
    expect(capabilityStatus(gcpFailure, "GCP", "cost", "AVAILABLE")).toBe("UNAVAILABLE");
  });

  it("lets current failures override an old available snapshot", () => {
    const failed = { ...data, state: [{ ...data.state[0], status: "ERROR" as const }] };
    expect(capabilityStatus(failed, "AWS", "infrastructure", "AVAILABLE")).toBe("UNAVAILABLE");
    expect(capabilityObservedAt(failed, "AWS", "infrastructure", null)).toBe(data.state[0].lastAttemptAt);
  });

  it("normalizes error and unauthorized states to unavailable", () => {
    expect(normalizeObserverStatus("ERROR")).toBe("UNAVAILABLE");
    expect(normalizeObserverStatus("UNAUTHORIZED")).toBe("UNAVAILABLE");
    expect(capabilityStatus({ ...data, state: [{ ...data.state[0], status: "STALE" as const }] }, "AWS", "infrastructure", "AVAILABLE")).toBe("STALE");
  });

  it("keeps unavailable GCP billing and unknown credit values explicit", () => {
    const gcpCost = { ...data.costs[0], provider: "GCP" as const, valueStatus: { gross: "UNKNOWN" as const }, freshness: "UNAVAILABLE" as const };
    expect(financialDisplay(gcpCost, "monthToDateGrossCost").text).toBe("Waiting for billing data");
    expect(formatMoney(null, "USD", "Unknown")).toBe("Unknown");
    expect(creditDisplay({ provider: "GCP", accountId: "p", creditType: "promo", currency: "USD", remainingAmount: null, estimatedRemainingAmount: null, valueStatus: "UNKNOWN", observedAt: "2026-09-15T00:00:00.000Z", freshness: "UNAVAILABLE" })).toEqual({ text: "Unknown", status: "UNKNOWN" });
  });

  it("does not treat unknown or delayed financial values as authoritative", () => {
    expect(financialDisplay({ ...data.costs[0], monthToDateGrossCost: 12, valueStatus: { gross: "UNKNOWN" as const } }, "monthToDateGrossCost").text).toBe("Waiting for billing data");
    expect(financialDisplay({ ...data.costs[0], monthToDateGrossCost: 12, valueStatus: { gross: "ESTIMATED" as const } }, "monthToDateGrossCost").status).toBe("ESTIMATED");
    expect(financialDisplay({ ...data.costs[0], monthToDateGrossCost: 12, valueStatus: { gross: "DELAYED" as const } }, "monthToDateGrossCost").status).toBe("DELAYED");
  });

  it("exposes only services actually present in a breakdown", () => {
    expect(serviceBreakdown(data.costs[0])).toEqual([]);
    expect(serviceBreakdown({ ...data.costs[0], breakdown: { services: { "Vertex AI": 2.5, "Cloud Run": 1.25, "Compute Engine": 3 }, projects: {} } })).toEqual([
      ["Vertex AI", 2.5], ["Cloud Run", 1.25], ["Compute Engine", 3],
    ]);
  });
});
