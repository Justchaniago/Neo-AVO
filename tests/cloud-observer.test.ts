import { describe, expect, it, vi } from "vitest";

import { loadEnv } from "../src/config/env";
import { collectProviders } from "../src/cloud-observer/collector";
import { deriveMonthEndProjection } from "../src/cloud-observer/finops";
import { runCloudObserver } from "../src/cloud-observer/worker";
import { observerTablesOnly } from "../src/cloud-observer/repository";
import { persistCapability } from "../src/cloud-observer/repository";
import * as schema from "../src/db/schema";
import type { CloudProviderAdapter } from "../src/cloud-observer/types";

function fakeDb() {
  const rows: unknown[] = [];
  const tables: string[] = [];
  return {
    rows,
    tables,
    insert: (table: unknown) => { tables.push(table === schema.cloudObserverState ? "cloud_observer_state" : table === schema.cloudCostSnapshots ? "cloud_cost_snapshots" : table === schema.cloudResourceSnapshots ? "cloud_resource_snapshots" : table === schema.cloudCreditSnapshots ? "cloud_credit_snapshots" : "unknown"); return {
      values: (value: unknown) => { rows.push(value); return { onConflictDoUpdate: async () => undefined }; },
    }; },
  } as never;
}

describe("cloud observer M0 boundaries", () => {
  it("disabled observer performs no provider work", async () => {
    const provider = { provider: "AWS", collect: vi.fn() } as unknown as CloudProviderAdapter;
    const result = await runCloudObserver({ env: loadEnv({ CLOUD_OBSERVER_ENABLED: "false" }), providers: [provider] });
    expect(result.enabled).toBe(false);
    expect(provider.collect).not.toHaveBeenCalled();
  });

  it("isolates AWS failure from GCP collection", async () => {
    const db = fakeDb();
    const aws: CloudProviderAdapter = { provider: "AWS", collect: async () => { throw new Error("AWS down"); } };
    const gcp: CloudProviderAdapter = { provider: "GCP", collect: async () => ({ status: "AVAILABLE", cost: { provider: "GCP", accountId: "p", currency: "USD", monthToDateGrossCost: null, creditsApplied: null, monthToDateNetCost: null, dailyBurnRate: null, projectedMonthEnd: null, valueStatus: { gross: "UNKNOWN" }, observedAt: new Date(), providerDataAsOf: null, freshness: "AVAILABLE" } }) };
    await collectProviders(db, [aws, gcp], ["cost"], new Date(), 1000);
    expect((db as unknown as { rows: unknown[] }).rows).toHaveLength(3);
  });

  it("isolates GCP failure from AWS collection", async () => {
    const db = fakeDb();
    const aws: CloudProviderAdapter = { provider: "AWS", collect: async () => ({ status: "AVAILABLE", cost: { provider: "AWS", accountId: "a", currency: null, monthToDateGrossCost: null, creditsApplied: null, monthToDateNetCost: null, dailyBurnRate: null, projectedMonthEnd: null, valueStatus: { gross: "UNKNOWN" }, observedAt: new Date(), providerDataAsOf: null, freshness: "AVAILABLE" } }) };
    const gcp: CloudProviderAdapter = { provider: "GCP", collect: async () => { throw new Error("GCP down"); } };
    await collectProviders(db, [aws, gcp], ["cost"], new Date(), 1000);
    expect((db as unknown as { rows: unknown[] }).rows).toHaveLength(3);
  });

  it("preserves unknown values and never turns them into zero", () => {
    const result = deriveMonthEndProjection({ monthToDateGrossCost: null, creditsApplied: null, monthToDateNetCost: null, now: new Date("2026-09-14T00:00:00Z") });
    expect(result.dailyBurnRate).toBeNull();
    expect(result.projectedMonthEnd).toBeNull();
    expect(result.valueStatus.gross).toBe("UNKNOWN");
  });

  it("limits persistence contract to observer-owned tables", () => {
    expect(observerTablesOnly("cloud_resource_snapshots")).toBe(true);
    expect(observerTablesOnly("events")).toBe(false);
    expect(observerTablesOnly("incidents")).toBe(false);
  });

  it("persists normalized observations only through observer tables", async () => {
    const db = fakeDb();
    await persistCapability(db, "AWS", "cost", {
      status: "AVAILABLE",
      cost: { provider: "AWS", accountId: "a", currency: "USD", monthToDateGrossCost: null, creditsApplied: null, monthToDateNetCost: null, dailyBurnRate: null, projectedMonthEnd: null, valueStatus: { gross: "UNKNOWN" }, observedAt: new Date(), providerDataAsOf: null, freshness: "AVAILABLE" },
    }, new Date());
    const tables = (db as unknown as { tables: string[] }).tables;
    expect(tables.every(observerTablesOnly)).toBe(true);
  });
});
