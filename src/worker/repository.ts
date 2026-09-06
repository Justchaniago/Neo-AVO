import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { events, tasks } from "../db/schema";

type Db = NodePgDatabase<typeof schema>;
type QueryDb = Pick<Db, "select" | "update" | "insert">;

const MAX_PROCESSING_ERROR_LENGTH = 1000;

export async function claimPendingEvent(db: Db, workerId: string, now = new Date(), leaseMs = 30_000) {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(events)
      .where(and(isNull(events.processedAt), isNull(events.quarantinedAt), or(isNull(events.claimExpiresAt), lt(events.claimExpiresAt, now))))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!event) return null;

    const claimToken = `${workerId}:${randomUUID()}`;
    const claimExpiresAt = new Date(now.getTime() + leaseMs);
    const [claimed] = await tx
      .update(events)
      .set({ claimToken, claimedAt: now, claimExpiresAt, processingAttempts: sql`${events.processingAttempts} + 1` })
      .where(eq(events.id, event.id))
      .returning();
    return claimed;
  });
}

export async function markEventProcessed(db: QueryDb, eventId: string, claimToken: string, processedAt = new Date()) {
  const [event] = await db.update(events).set({ processedAt, claimToken: null, claimedAt: null, claimExpiresAt: null, processingError: null }).where(and(eq(events.id, eventId), eq(events.claimToken, claimToken), isNull(events.processedAt))).returning();
  return event;
}

export async function markEventFailed(db: Db, eventId: string, claimToken: string, attempts: number, error: unknown, maxAttempts: number) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_PROCESSING_ERROR_LENGTH);
  const quarantined = attempts >= maxAttempts;
  const [event] = await db.update(events).set({ processingError: message, quarantinedAt: quarantined ? new Date() : null, claimToken: null, claimedAt: null, claimExpiresAt: null }).where(and(eq(events.id, eventId), eq(events.claimToken, claimToken), isNull(events.processedAt))).returning();
  return event;
}

export async function findTask(db: QueryDb, projectId: string, environment: string, externalTaskId: string) {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.environment, environment), eq(tasks.externalTaskId, externalTaskId))).limit(1);
  return task;
}

export async function upsertTask(db: QueryDb, values: typeof tasks.$inferInsert) {
  const [task] = await db.insert(tasks).values(values).onConflictDoUpdate({ target: [tasks.projectId, tasks.environment, tasks.externalTaskId], set: { ...values, updatedAt: new Date() } }).returning();
  return task;
}
