import { describe, expect, it, vi } from "vitest";

const insertEvents = vi.hoisted(() => vi.fn());
vi.mock("../src/events/repository", () => ({ insertEvents }));

import { persistEventBatch, validateEventBatch } from "../src/events/usecases";

const project = { id: "project-uuid", slug: "keymax", environment: "production" };
const validEvent = {
  schemaVersion: 1 as const,
  eventId: "evt_1",
  projectId: "keymax",
  environment: "production",
  type: "task.failed",
  occurredAt: "2026-09-06T12:40:00.000+07:00",
  data: { taskId: "task_123", message: "Provider timeout" },
};

describe("durable event ingestion contract", () => {
  it("accepts a valid batch and tolerates additive fields", () => {
    const result = validateEventBatch({ events: [{ ...validEvent, traceId: "trace_1" }], producerVersion: "1.0" }, project);
    expect(result.ok).toBe(true);
  });

  it("rejects mixed projects and environments", () => {
    expect(validateEventBatch({ events: [validEvent, { ...validEvent, eventId: "evt_2", projectId: "other" }] }, project)).toMatchObject({ ok: false, kind: "project_scope_mismatch", eventId: "evt_2" });
    expect(validateEventBatch({ events: [validEvent, { ...validEvent, eventId: "evt_3", environment: "staging" }] }, project)).toMatchObject({ ok: false, kind: "project_scope_mismatch", eventId: "evt_3" });
  });

  it("rejects unknown types and malformed type data safely", () => {
    expect(validateEventBatch({ events: [{ ...validEvent, type: "future.unknown" }] }, project)).toMatchObject({ ok: false, kind: "unknown_event_type" });
    expect(validateEventBatch({ events: [{ ...validEvent, data: { message: "missing task id" } }] }, project)).toMatchObject({ ok: false, kind: "invalid_event_data" });
  });

  it("rejects missing required fields and unsupported envelope versions", () => {
    const { eventId: _eventId, ...missingEventId } = validEvent;
    expect(validateEventBatch({ events: [missingEventId] }, project)).toMatchObject({ ok: false, kind: "invalid_envelope" });
    expect(validateEventBatch({ events: [{ ...validEvent, schemaVersion: 2 }] }, project)).toMatchObject({ ok: false, kind: "invalid_envelope" });
  });

  it("persists duplicates idempotently through the unique event id insert", async () => {
    insertEvents.mockResolvedValueOnce([{ eventId: "evt_1" }]);
    const db = { transaction: (callback: (tx: unknown) => Promise<unknown>) => callback({}) };
    const inserted = await persistEventBatch(db as never, [validEvent, { ...validEvent, eventId: "evt_duplicate" }], project.id);
    expect(inserted).toEqual([{ eventId: "evt_1" }]);
    expect(insertEvents).toHaveBeenCalledTimes(1);
  });

  it("propagates persistence failure so the route cannot return 202", async () => {
    const db = { transaction: async () => { throw new Error("database unavailable"); } };
    await expect(persistEventBatch(db as never, [validEvent], project.id)).rejects.toThrow("database unavailable");
  });
});
