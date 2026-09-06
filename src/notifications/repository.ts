import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";

import * as schema from "../db/schema";
import { notifications } from "../db/schema";

type Db = NodePgDatabase<typeof schema>;

export async function claimPendingNotification(db: Db, now = new Date()) {
  return db.transaction(async (tx) => {
    const staleClaimAt = new Date(now.getTime() - 30_000);
    const [notification] = await tx.select().from(notifications).where(and(or(and(or(eq(notifications.status, "PENDING"), eq(notifications.status, "FAILED")), or(isNull(notifications.nextAttemptAt), lte(notifications.nextAttemptAt, now))), and(eq(notifications.status, "SENDING"), lt(notifications.claimedAt, staleClaimAt))), sql`${notifications.deliveryAttempts} < 5`)).limit(1).for("update", { skipLocked: true });
    if (!notification) return null;
    const claimToken = randomUUID();
    const [claimed] = await tx.update(notifications).set({ status: "SENDING", claimToken, claimedAt: now, deliveryAttempts: sql`${notifications.deliveryAttempts} + 1` }).where(eq(notifications.id, notification.id)).returning();
    return claimed;
  });
}

export async function markNotificationSent(db: Db, id: string, claimToken: string) {
  return db.update(notifications).set({ status: "SENT", sentAt: new Date(), claimToken: null, claimedAt: null, lastError: null }).where(and(eq(notifications.id, id), eq(notifications.claimToken, claimToken))).returning();
}

export async function markNotificationFailed(db: Db, id: string, claimToken: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  return db.update(notifications).set({ status: "FAILED", lastError: message, nextAttemptAt: new Date(Date.now() + 60_000), claimToken: null, claimedAt: null }).where(and(eq(notifications.id, id), eq(notifications.claimToken, claimToken))).returning();
}
