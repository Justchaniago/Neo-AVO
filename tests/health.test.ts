import { describe, expect, it } from "vitest";

import { availabilityAt, deriveHealthFromEvent, healthAt } from "../src/health/derivation";

const now = new Date("2026-09-06T12:00:00Z");
const base = (overrides: Record<string, unknown> = {}) => ({
  runtimeMode: "always_on", healthStrategy: "heartbeat", availability: "UNKNOWN", operationalHealth: "UNKNOWN", staleAfterSeconds: 60, offlineAfterSeconds: 300, expectedNextExecutionAt: null, gracePeriodSeconds: null, expectedIntervalSeconds: null, lastSeenAt: null, lastOperationalAt: null, lastSuccessfulExecutionAt: null, lastExecutionAt: null, lastFailureAt: null, lastErrorSignature: null, lastHealthEventAt: null, ...overrides,
});

describe("project health derivation", () => {
  it("derives heartbeat availability bands and unknown evidence", () => {
    expect(availabilityAt(base({ lastSeenAt: new Date("2026-09-06T11:59:30Z") }), now)).toBe("ONLINE");
    expect(availabilityAt(base({ lastSeenAt: new Date("2026-09-06T11:58:00Z") }), now)).toBe("STALE");
    expect(availabilityAt(base({ lastSeenAt: new Date("2026-09-06T11:50:00Z") }), now)).toBe("OFFLINE");
    expect(availabilityAt(base(), now)).toBe("UNKNOWN");
  });

  it("keeps availability separate from operational health", () => {
    const degraded = deriveHealthFromEvent(base({ lastHealthEventAt: null }), { type: "dependency.degraded", occurredAt: new Date("2026-09-06T11:59:00Z"), data: { dependency: "payments" } });
    expect(degraded).toMatchObject({ operationalHealth: "DEGRADED" });
    expect(availabilityAt(base({ lastSeenAt: new Date("2026-09-06T11:59:30Z") }), now)).toBe("ONLINE");
    expect(deriveHealthFromEvent(base(), { type: "task.failed", occurredAt: new Date("2026-09-06T11:59:00Z"), data: { taskId: "t", message: "timeout" } })).toMatchObject({ operationalHealth: "FAILING", availability: "ONLINE" });
  });

  it("derives healthy execution and overdue expected execution", () => {
    const project = base({ runtimeMode: "scheduled", healthStrategy: "execution_based", expectedNextExecutionAt: new Date("2026-09-06T11:59:00Z"), gracePeriodSeconds: 30 });
    const completed = deriveHealthFromEvent(project, { type: "task.completed", occurredAt: new Date("2026-09-06T11:58:00Z"), data: { taskId: "t" } });
    expect(completed).toMatchObject({ operationalHealth: "HEALTHY", availability: "ONLINE", lastSuccessfulExecutionAt: new Date("2026-09-06T11:58:00Z") });
    expect(healthAt(project, now)).toBe("DEGRADED");
  });

  it("does not mark on-demand projects offline without execution evidence", () => {
    expect(availabilityAt(base({ runtimeMode: "on_demand", healthStrategy: "execution_based" }), now)).toBe("UNKNOWN");
    expect(availabilityAt(base({ runtimeMode: "on_demand", healthStrategy: "execution_based", lastExecutionAt: new Date("2026-01-01T00:00:00Z") }), now)).toBe("ONLINE");
  });

  it("accepts newer evidence for recovery and ignores stale health evidence", () => {
    const failing = base({ operationalHealth: "FAILING", lastHealthEventAt: new Date("2026-09-06T11:59:00Z") });
    expect(deriveHealthFromEvent(failing, { type: "task.completed", occurredAt: new Date("2026-09-06T11:59:30Z"), data: { taskId: "t" } })).toMatchObject({ operationalHealth: "HEALTHY" });
    expect(deriveHealthFromEvent(failing, { type: "task.completed", occurredAt: new Date("2026-09-06T11:58:00Z"), data: { taskId: "t" } })).toEqual({});
  });

  it("keeps Tele Auto activity online while separating operational failure", () => {
    const project = base({ healthStrategy: "execution_based", runtimeMode: "on_demand" });
    expect(deriveHealthFromEvent(project, { type: "tele_auto.run.needs_clarification", occurredAt: now, data: { runId: "run-1" } })).toMatchObject({ availability: "ONLINE", operationalHealth: "HEALTHY" });
    expect(deriveHealthFromEvent(project, { type: "tele_auto.sheets.schema_mismatch", occurredAt: new Date(now.getTime() + 1000), data: { runId: "run-1", errorCode: "HEADER_MISSING" } })).toMatchObject({ availability: "ONLINE", operationalHealth: "DEGRADED" });
  });
});
