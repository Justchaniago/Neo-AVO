import { createHash } from "node:crypto";
import { z } from "zod";

import type { tasks } from "../db/schema";

type Task = typeof tasks.$inferSelect;
type TaskEvent = { type: string; occurredAt: Date; sequence: string | null; data: unknown };
type Projection = Omit<typeof tasks.$inferInsert, "id" | "updatedAt">;

const taskDataSchema = z.object({
  taskId: z.string().min(1),
  attempt: z.number().int().nonnegative().optional(),
  runId: z.string().min(1).optional(),
  message: z.string().max(10000).optional(),
  error: z.string().max(10000).optional(),
  taskType: z.string().max(200).optional(),
}).passthrough();

const transitions: Record<string, string> = {
  "task.started": "running",
  "task.completed": "completed",
  "task.failed": "failed",
  "task.cancelled": "cancelled",
  "task.retrying": "retrying",
};

const terminalStates = new Set(["completed", "failed", "cancelled"]);

function numericSequence(value: string | null | undefined) {
  return value && /^\d+$/.test(value) ? BigInt(value) : null;
}

function errorSignature(data: z.infer<typeof taskDataSchema>) {
  const message = data.message ?? data.error;
  return message ? createHash("sha256").update(message).digest("hex") : null;
}

function isNewer(current: Task, event: TaskEvent, data: z.infer<typeof taskDataSchema>) {
  const incomingAttempt = data.attempt ?? current.currentAttempt;
  if (incomingAttempt < current.currentAttempt) return false;
  if (incomingAttempt > current.currentAttempt) return true;
  if (data.runId && current.currentRunId && data.runId !== current.currentRunId) return false;

  const incomingSequence = numericSequence(event.sequence);
  const currentSequence = numericSequence(current.lastSequence);
  if (incomingSequence !== null && currentSequence !== null) return incomingSequence > currentSequence;
  if (incomingSequence !== null && currentSequence === null) return true;
  if (incomingSequence === null && currentSequence !== null) return false;
  return event.occurredAt.getTime() > current.lastEventAt.getTime();
}

export function projectTaskEvent(current: Task | null, event: TaskEvent, projectId: string, environment: string): Projection | null {
  const status = transitions[event.type];
  if (!status) return null;
  const parsed = taskDataSchema.safeParse(event.data);
  if (!parsed.success) throw new Error(`invalid task event data: ${parsed.error.issues[0]?.message ?? "invalid data"}`);
  const data = parsed.data;
  if (current && !isNewer(current, event, data)) return null;
  if (current && terminalStates.has(current.status) && status !== current.status && (data.attempt ?? current.currentAttempt) <= current.currentAttempt) return null;

  const attempt = data.attempt ?? current?.currentAttempt ?? 0;
  const now = event.occurredAt;
  return {
    projectId,
    environment,
    externalTaskId: data.taskId,
    type: data.taskType ?? current?.type ?? "task",
    status,
    currentAttempt: attempt,
    currentRunId: data.runId ?? current?.currentRunId ?? null,
    lastSequence: event.sequence,
    lastError: status === "failed" ? data.message ?? data.error ?? null : current?.lastError ?? null,
    lastErrorSignature: status === "failed" ? errorSignature(data) : current?.lastErrorSignature ?? null,
    lastEventAt: now,
    startedAt: status === "running" ? current?.startedAt ?? now : current?.startedAt ?? null,
    completedAt: terminalStates.has(status) ? now : null,
    metadata: current?.metadata ?? {},
  };
}
