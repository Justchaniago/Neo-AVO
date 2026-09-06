import { describe, expect, it } from "vitest";

import { projectTaskEvent } from "../src/tasks/projection";

const scope = { projectId: "project-a", environment: "production" };
const event = (type: string, occurredAt: string, data: Record<string, unknown>, sequence: string | null = null) => ({ type, occurredAt: new Date(occurredAt), data, sequence });

describe("task current-state projection", () => {
  it("creates and advances a task", () => {
    const started = projectTaskEvent(null, event("task.started", "2026-09-06T01:00:00Z", { taskId: "task-1", attempt: 1, runId: "run-1" }, "1"), scope.projectId, scope.environment);
    const completed = projectTaskEvent({ ...started, id: "row-1", updatedAt: new Date() } as never, event("task.completed", "2026-09-06T01:01:00Z", { taskId: "task-1", attempt: 1, runId: "run-1" }, "2"), scope.projectId, scope.environment);
    expect(started).toMatchObject({ externalTaskId: "task-1", status: "running", currentAttempt: 1, currentRunId: "run-1" });
    expect(completed).toMatchObject({ status: "completed", currentAttempt: 1, lastSequence: "2" });
  });

  it("ignores duplicate or stale events without using received order", () => {
    const current = {
      id: "row-1", updatedAt: new Date(), ...scope, externalTaskId: "task-1", type: "task", status: "completed", currentAttempt: 1, currentRunId: "run-1", lastSequence: "10", lastEventAt: new Date("2026-09-06T01:10:00Z"), startedAt: new Date("2026-09-06T01:00:00Z"), completedAt: new Date("2026-09-06T01:10:00Z"), lastError: null, lastErrorSignature: null, metadata: {},
    };
    expect(projectTaskEvent(current as never, event("task.started", "2026-09-06T01:00:01Z", { taskId: "task-1", attempt: 1, runId: "run-1" }, "9"), scope.projectId, scope.environment)).toBeNull();
    expect(projectTaskEvent(current as never, event("task.started", "2026-09-06T01:20:00Z", { taskId: "task-1", attempt: 1, runId: "run-1" }, "10"), scope.projectId, scope.environment)).toBeNull();
  });

  it("protects failed and cancelled terminal states from delayed starts/retries", () => {
    const base = { id: "row-1", updatedAt: new Date(), ...scope, externalTaskId: "task-1", type: "task", currentAttempt: 2, currentRunId: "run-2", lastSequence: "20", lastEventAt: new Date("2026-09-06T01:10:00Z"), startedAt: new Date("2026-09-06T01:00:00Z"), completedAt: null, lastError: "timeout", lastErrorSignature: "sig", metadata: {} };
    expect(projectTaskEvent({ ...base, status: "failed" } as never, event("task.started", "2026-09-06T01:11:00Z", { taskId: "task-1", attempt: 2, runId: "run-2" }, "21"), scope.projectId, scope.environment)).toBeNull();
    expect(projectTaskEvent({ ...base, status: "cancelled" } as never, event("task.retrying", "2026-09-06T01:11:00Z", { taskId: "task-1", attempt: 2, runId: "run-2" }, "21"), scope.projectId, scope.environment)).toBeNull();
  });

  it("accepts a legitimate newer retry attempt", () => {
    const current = { id: "row-1", updatedAt: new Date(), ...scope, externalTaskId: "task-1", type: "task", status: "failed", currentAttempt: 1, currentRunId: "run-1", lastSequence: "8", lastEventAt: new Date("2026-09-06T01:10:00Z"), startedAt: new Date("2026-09-06T01:00:00Z"), completedAt: new Date("2026-09-06T01:10:00Z"), lastError: "timeout", lastErrorSignature: "sig", metadata: {} };
    const retry = projectTaskEvent(current as never, event("task.retrying", "2026-09-06T00:30:00Z", { taskId: "task-1", attempt: 2, runId: "run-2" }, "1"), scope.projectId, scope.environment);
    expect(retry).toMatchObject({ status: "retrying", currentAttempt: 2, currentRunId: "run-2" });
  });

  it("uses occurredAt only when sequence and attempt/run identity do not decide", () => {
    const current = { id: "row-1", updatedAt: new Date(), ...scope, externalTaskId: "task-1", type: "task", status: "running", currentAttempt: 1, currentRunId: null, lastSequence: null, lastEventAt: new Date("2026-09-06T01:10:00Z"), startedAt: new Date("2026-09-06T01:00:00Z"), completedAt: null, lastError: null, lastErrorSignature: null, metadata: {} };
    expect(projectTaskEvent(current as never, event("task.completed", "2026-09-06T01:09:00Z", { taskId: "task-1", attempt: 1 }), scope.projectId, scope.environment)).toBeNull();
  });
});
