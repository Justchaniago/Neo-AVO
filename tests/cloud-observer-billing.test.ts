import { describe, expect, it, vi } from "vitest";

import { collectGcpBilling } from "../src/cloud-observer/providers/gcp-billing";
import { persistCapability } from "../src/cloud-observer/repository";

const observedAt = new Date("2026-09-15T12:00:00.000Z");
const auth = { getClient: async () => ({ getAccessToken: async () => ({ token: "gcp-test-token" }) }) } as never;

function row(date: string, service: string, project: string, gross: string, credits: string | null) {
  return { f: [{ v: date }, { v: service }, { v: project }, { v: gross }, { v: credits }] };
}

function billing(rows: unknown[], extra: Record<string, unknown> = {}) {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ jobComplete: true, rows, ...extra }), { status: 200 }));
  return { config: { billingProjectId: "billing-project", dataset: "billing_export", table: "gcp_billing_export_v1_010258_3E9227_C05236", auth, fetch: fetcher }, fetcher };
}

describe("GCP Billing export adapter", () => {
  it("calculates fractional gross, credits, net and deterministic projection by service", async () => {
    const fixture = billing([
      row("2026-09-14", "Vertex AI", "cluster-01-core-prod", "12.3456", "-2.0001"),
      row("2026-09-14", "Cloud Run", "cluster-01-core-prod", "3.1000", null),
      row("2026-09-13", "Cloud Storage", "other-project", "4.5000", "-0.5000"),
    ]);
    const result = await collectGcpBilling(fixture.config, "cost", observedAt);
    expect(result.status).toBe("AVAILABLE");
    expect(result.cost?.monthToDateGrossCost).toBeCloseTo(19.9456, 4);
    expect(result.cost?.creditsApplied).toBeCloseTo(-2.5001, 4);
    expect(result.cost?.monthToDateNetCost).toBeCloseTo(17.4455, 4);
    expect(result.cost?.breakdown?.services).toEqual({ "Vertex AI": 12.3456, "Cloud Run": 3.1, "Cloud Storage": 4.5 });
    expect(result.cost?.breakdown?.projects).toEqual({ "cluster-01-core-prod": 15.4456, "other-project": 4.5 });
    expect(result.cost?.valueStatus.net).toBe("ACTUAL");
    expect(fixture.fetcher.mock.calls[0][1]?.body).toContain("@start_time");
    expect(fixture.fetcher.mock.calls[0][1]?.body).not.toContain("SELECT *");
  });

  it("keeps missing credits unknown and does not fabricate remaining credit", async () => {
    const fixture = billing([row("2026-09-14", "Cloud Run", "cluster-01-core-prod", "1.25", null)]);
    const cost = await collectGcpBilling(fixture.config, "cost", observedAt);
    const credit = await collectGcpBilling({ ...fixture.config, creditAllocation: 100 }, "credits", observedAt);
    expect(cost.cost?.creditsApplied).toBeNull();
    expect(cost.cost?.monthToDateNetCost).toBeNull();
    expect(credit.credits?.[0].estimatedRemainingAmount).toBeNull();
    expect(credit.credits?.[0].valueStatus).toBe("UNKNOWN");
  });

  it("estimates remaining credit only from an explicit allocation baseline", async () => {
    const fixture = billing([row("2026-09-14", "Vertex AI", "cluster-01-core-prod", "10.00", "-2.25")]);
    const result = await collectGcpBilling({ ...fixture.config, creditAllocation: 25 }, "credits", observedAt);
    expect(result.credits?.[0].originalAmount).toBe(25);
    expect(result.credits?.[0].estimatedRemainingAmount).toBeCloseTo(22.75, 4);
    expect(result.credits?.[0].valueStatus).toBe("ESTIMATED");
  });

  it("marks stale export data delayed and preserves null for empty exports", async () => {
    const delayed = await collectGcpBilling(billing([row("2026-09-10", "Compute Engine", "cluster-01-core-prod", "2.5", "0")]).config, "cost", observedAt);
    const empty = await collectGcpBilling(billing([]).config, "cost", observedAt);
    expect(delayed.cost?.freshness).toBe("STALE");
    expect(delayed.cost?.valueStatus.gross).toBe("DELAYED");
    expect(empty.status).toBe("UNAVAILABLE");
    expect(empty.cost?.monthToDateGrossCost).toBeNull();
    expect(empty.cost?.projectedMonthEnd).toBeNull();
  });

  it("fails closed on BigQuery errors without returning a fabricated snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "permission denied" } }), { status: 403 }));
    const result = await collectGcpBilling({ billingProjectId: "billing-project", dataset: "billing_export", table: "billing_table", auth, fetch: fetcher }, "cost", observedAt);
    expect(result.status).toBe("UNAUTHORIZED");
    expect(result.cost).toBeUndefined();
  });

  it("leaves the prior cost snapshot untouched when persistence receives a provider failure", async () => {
    const writes: unknown[] = [];
    const db = {
      insert: (table: unknown) => {
        writes.push(table);
        return { values: () => ({ onConflictDoUpdate: async () => undefined }) };
      },
    } as never;
    await persistCapability(db, "GCP", "cost", { status: "ERROR", error: "BigQuery unavailable" }, observedAt);
    expect(writes).toHaveLength(1); // observer state only; no replacement cost row
  });
});
