import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findTask: vi.fn(), findProjectById: vi.fn(), markEventFailed: vi.fn(), markEventProcessed: vi.fn(), updateProject: vi.fn(), upsertTask: vi.fn() }));
vi.mock("../src/worker/repository", () => mocks);
vi.mock("../src/projects/repository", () => ({ findProjectById: mocks.findProjectById, updateProject: mocks.updateProject }));

import { processClaimedEvent } from "../src/worker/processor";

const event = (overrides: Record<string, unknown> = {}) => ({
  id: "raw-1", eventId: "evt-1", schemaVersion: 1, projectId: "project-a", environment: "production", type: "task.completed", occurredAt: new Date("2026-09-06T01:00:00Z"), sequence: "2", data: { taskId: "task-1" }, receivedAt: new Date(), processedAt: null, processingAttempts: 1, processingError: null, quarantinedAt: null, claimToken: "worker-1:claim", claimedAt: new Date(), claimExpiresAt: new Date(), ...overrides,
});

const transactionalDb = { transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({}) };

describe("worker processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProjectById.mockResolvedValue({ runtimeMode: "always_on", healthStrategy: "heartbeat", availability: "UNKNOWN", operationalHealth: "UNKNOWN", staleAfterSeconds: 60, offlineAfterSeconds: 300, expectedNextExecutionAt: null, gracePeriodSeconds: null, expectedIntervalSeconds: null, lastSeenAt: null, lastOperationalAt: null, lastSuccessfulExecutionAt: null, lastExecutionAt: null, lastFailureAt: null, lastErrorSignature: null, lastHealthEventAt: null, id: "project-a" });
  });

  it("projects and marks a claimed event atomically", async () => {
    mocks.findTask.mockResolvedValue(null);
    mocks.markEventProcessed.mockResolvedValue({ id: "raw-1" });
    const result = await processClaimedEvent(transactionalDb as never, event());
    expect(result.status).toBe("processed");
    expect(mocks.upsertTask).toHaveBeenCalledOnce();
    expect(mocks.markEventProcessed).toHaveBeenCalledOnce();
    expect(mocks.markEventFailed).not.toHaveBeenCalled();
  });

  it("marks a processing failure for retry and quarantines at the bound", async () => {
    mocks.findTask.mockResolvedValue(null);
    mocks.markEventFailed.mockResolvedValue({ id: "raw-1" });
    const result = await processClaimedEvent(transactionalDb as never, event({ data: {}, type: "task.failed", processingAttempts: 3 }));
    expect(result.status).toBe("quarantined");
    expect(mocks.markEventFailed).toHaveBeenCalledWith(expect.anything(), "raw-1", "worker-1:claim", 3, expect.any(Error), 3);
  });

  it("is restart-safe when a previously projected event is reprocessed", async () => {
    mocks.findTask.mockResolvedValue({ id: "task-row", projectId: "project-a", environment: "production", externalTaskId: "task-1", type: "task", status: "completed", currentAttempt: 1, currentRunId: null, lastSequence: "2", lastEventAt: new Date("2026-09-06T01:00:00Z"), startedAt: null, completedAt: new Date(), lastError: null, lastErrorSignature: null, metadata: {}, updatedAt: new Date() });
    mocks.markEventProcessed.mockResolvedValue({ id: "raw-1" });
    await processClaimedEvent(transactionalDb as never, event());
    expect(mocks.upsertTask).not.toHaveBeenCalled();
    expect(mocks.markEventProcessed).toHaveBeenCalledOnce();
  });
});
