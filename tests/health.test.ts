import { describe, expect, it } from "vitest";

import { availabilityAt, businessHealthAt, deriveHealthFromEvent, healthAt } from "../src/health/derivation";

const now = new Date("2026-09-06T12:00:00Z");
const base = (overrides: Record<string, unknown> = {}) => ({
  runtimeMode: "always_on", healthStrategy: "heartbeat", availability: "UNKNOWN", operationalHealth: "UNKNOWN", businessHealth: "UNKNOWN", staleAfterSeconds: 60, offlineAfterSeconds: 300, expectedNextExecutionAt: null, gracePeriodSeconds: null, expectedIntervalSeconds: null, lastSeenAt: null, lastOperationalAt: null, lastSuccessfulExecutionAt: null, lastExecutionAt: null, lastFailureAt: null, lastErrorSignature: null, lastHealthEventAt: null, ...overrides,
});

describe("project health derivation V1.1", () => {
  it("derives heartbeat availability bands and unknown evidence", () => {
    expect(availabilityAt(base({ lastSeenAt: new Date("2026-09-06T11:59:30Z") }), now)).toBe("ONLINE");
    expect(availabilityAt(base({ lastSeenAt: new Date("2026-09-06T11:58:00Z") }), now)).toBe("STALE");
    expect(availabilityAt(base({ lastSeenAt: new Date("2026-09-06T11:50:00Z") }), now)).toBe("OFFLINE");
    expect(availabilityAt(base(), now)).toBe("UNKNOWN");
  });

  it("CASE A — Active failure: latest authoritative evidence = failure, expects FAILING", () => {
    const derived = deriveHealthFromEvent(base(), { type: "task.failed", occurredAt: new Date("2026-09-06T11:59:00Z"), data: { taskId: "t1", error: "fail" } });
    expect(derived).toMatchObject({ operationalHealth: "FAILING", businessHealth: "FAILING" });
  });

  it("CASE B & C — Remediation complete / Manual resolve: transitions FAILING to AWAITING_VERIFICATION pending next execution", () => {
    const failing = base({ operationalHealth: "FAILING", businessHealth: "FAILING", lastHealthEventAt: new Date("2026-09-06T11:50:00Z") });
    const awaiting = deriveHealthFromEvent(failing, { type: "incident.manually_resolved", occurredAt: new Date("2026-09-06T11:55:00Z"), data: { incidentId: "inc-1" } });
    expect(awaiting).toMatchObject({ operationalHealth: "AWAITING_VERIFICATION", businessHealth: "AWAITING_VERIFICATION" });
  });

  it("CASE D — Recovery actively occurring: dependency recovery transitions to RECOVERING", () => {
    const failing = base({ operationalHealth: "FAILING", businessHealth: "FAILING", lastHealthEventAt: new Date("2026-09-06T11:50:00Z") });
    const recovering = deriveHealthFromEvent(failing, { type: "dependency.recovered", occurredAt: new Date("2026-09-06T11:55:00Z"), data: {} });
    expect(recovering).toMatchObject({ operationalHealth: "RECOVERING", businessHealth: "RECOVERING" });
  });

  it("CASE E — Verification succeeds: AWAITING_VERIFICATION + authoritative execution success transitions to HEALTHY", () => {
    const awaiting = base({ operationalHealth: "AWAITING_VERIFICATION", businessHealth: "AWAITING_VERIFICATION", lastHealthEventAt: new Date("2026-09-06T11:55:00Z") });
    const healthy = deriveHealthFromEvent(awaiting, { type: "task.completed", occurredAt: new Date("2026-09-06T11:59:00Z"), data: { taskId: "t-1" } });
    expect(healthy).toMatchObject({ operationalHealth: "HEALTHY", businessHealth: "HEALTHY" });
  });

  it("CASE F — Verification fails: AWAITING_VERIFICATION + next execution failure transitions to FAILING", () => {
    const awaiting = base({ operationalHealth: "AWAITING_VERIFICATION", businessHealth: "AWAITING_VERIFICATION", lastHealthEventAt: new Date("2026-09-06T11:55:00Z") });
    const failing = deriveHealthFromEvent(awaiting, { type: "task.failed", occurredAt: new Date("2026-09-06T11:59:00Z"), data: { taskId: "t-1" } });
    expect(failing).toMatchObject({ operationalHealth: "FAILING", businessHealth: "FAILING" });
  });

  it("CASE G — Verification is missed: AWAITING_VERIFICATION + grace window expiry transitions to DEGRADED", () => {
    const overdueTime = new Date("2026-09-06T12:05:00Z");
    const awaitingProject = base({
      operationalHealth: "AWAITING_VERIFICATION",
      businessHealth: "AWAITING_VERIFICATION",
      runtimeMode: "scheduled",
      healthStrategy: "execution_based",
      expectedNextExecutionAt: new Date("2026-09-06T12:00:00Z"),
      gracePeriodSeconds: 120,
    });
    expect(healthAt(awaitingProject, overdueTime)).toBe("DEGRADED");
    expect(businessHealthAt(awaitingProject, overdueTime)).toBe("DEGRADED");
  });

  it("CASE H — Event-driven project: AWAITING_VERIFICATION with no fake next-execution timestamp", () => {
    const eventDrivenProject = base({
      runtimeMode: "on_demand",
      healthStrategy: "execution_based",
      operationalHealth: "FAILING",
      businessHealth: "FAILING",
      expectedNextExecutionAt: null,
    });
    const awaiting = deriveHealthFromEvent(eventDrivenProject, { type: "incident.manually_resolved", occurredAt: now, data: {} });
    expect(awaiting).toMatchObject({ operationalHealth: "AWAITING_VERIFICATION", businessHealth: "AWAITING_VERIFICATION" });
    expect(eventDrivenProject.expectedNextExecutionAt).toBeNull();
  });

  it("Business Contracts — Auto Email requires draftId for business HEALTHY proof", () => {
    const p = base({ slug: "auto-email", businessHealth: "UNKNOWN" });
    // Technical success without draftId does not prove business health
    const techOnly = deriveHealthFromEvent(p, { type: "task.completed", occurredAt: now, data: { taskType: "export_sales_draft" } });
    expect(techOnly.businessHealth).toBeUndefined();

    // Business proof with draftId proves HEALTHY
    const proof = deriveHealthFromEvent(p, { type: "task.completed", occurredAt: now, data: { taskType: "export_sales_draft", draftId: "r-123", store: "tp6" } });
    expect(proof.businessHealth).toBe("HEALTHY");
  });

  it("Business Contracts — Briefing Agent requires sent_count > 0 for business HEALTHY proof", () => {
    const p = base({ slug: "briefing-agent", businessHealth: "UNKNOWN" });
    // Generation with 0 sent is a business failure
    const genOnly = deriveHealthFromEvent(p, { type: "task.completed", occurredAt: now, data: { sent_count: 0 } });
    expect(genOnly.businessHealth).toBe("FAILING");

    // Delivery confirmed with sent_count > 0 proves HEALTHY
    const proof = deriveHealthFromEvent(p, { type: "task.completed", occurredAt: now, data: { sent_count: 4 } });
    expect(proof.businessHealth).toBe("HEALTHY");
  });

  it("Business Contracts — Tele Auto V2 requires WRITE_CONFIRMED execution phase", () => {
    const p = base({ slug: "tele-auto", businessHealth: "UNKNOWN" });
    const proof = deriveHealthFromEvent(p, { type: "tele_auto.run.completed", occurredAt: now, data: { executionPhase: "WRITE_CONFIRMED", store: "TP6" } });
    expect(proof.businessHealth).toBe("HEALTHY");
  });
});
