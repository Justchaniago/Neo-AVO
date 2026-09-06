import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { findTask, markEventFailed, markEventProcessed, upsertTask } from "./repository";
import { projectTaskEvent } from "../tasks/projection";

type Db = NodePgDatabase<typeof schema>;
export const MAX_PROCESSING_ATTEMPTS = 3;

export async function processClaimedEvent(db: Db, event: typeof schema.events.$inferSelect) {
  if (!event.claimToken) throw new Error("event has no claim token");
  try {
    await db.transaction(async (tx) => {
      if (event.type.startsWith("task.")) {
        const taskId = typeof event.data === "object" && event.data !== null && "taskId" in event.data && typeof event.data.taskId === "string" ? event.data.taskId : null;
        if (!taskId) throw new Error("invalid task event data: taskId is required");
        const current = await findTask(tx, event.projectId, event.environment, taskId);
        const projection = projectTaskEvent(current, { type: event.type, occurredAt: event.occurredAt, sequence: event.sequence, data: event.data }, event.projectId, event.environment);
        if (projection) await upsertTask(tx, projection);
      }
      const processed = await markEventProcessed(tx, event.id, event.claimToken!);
      if (!processed) throw new Error("event claim was lost before completion");
    });
    return { status: "processed" as const };
  } catch (error) {
    await markEventFailed(db, event.id, event.claimToken, event.processingAttempts, error, MAX_PROCESSING_ATTEMPTS);
    return { status: event.processingAttempts >= MAX_PROCESSING_ATTEMPTS ? "quarantined" as const : "retryable_failure" as const, error };
  }
}
