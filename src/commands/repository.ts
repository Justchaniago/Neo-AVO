import { and, asc, eq, inArray, isNull, lte, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { commands } from "../db/schema";
import { randomUUID } from "node:crypto";

type Db = NodePgDatabase<typeof schema>;
const errorLimit = 1000;

export async function insertCommand(db: Db, values: typeof commands.$inferInsert) { const [row] = await db.insert(commands).values(values).returning(); return row; }
export async function findCommand(db: Db, commandId: string) { const [row] = await db.select().from(commands).where(eq(commands.commandId, commandId)).limit(1); return row; }
export async function listProjectCommands(db: Db, projectId: string, environment: string) { return db.select().from(commands).where(and(eq(commands.projectId, projectId), eq(commands.environment, environment))).orderBy(asc(commands.requestedAt)).limit(100); }

export async function claimPushCommand(db: Db, now = new Date(), leaseMs = 30_000) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(commands).where(and(eq(commands.deliveryMode, "PUSH"), or(eq(commands.status, "REQUESTED"), eq(commands.status, "SENT")), or(isNull(commands.nextDeliveryAt), lte(commands.nextDeliveryAt, now)), or(isNull(commands.claimExpiresAt), lt(commands.claimExpiresAt, now)), sql`${commands.validUntil} > ${now}`, sql`${commands.deliveryAttempts} < 3`)).orderBy(asc(commands.requestedAt)).limit(1).for("update", { skipLocked: true });
    if (!row) return null;
    if (row.validUntil <= now) { await tx.update(commands).set({ status: "EXPIRED", updatedAt: now }).where(eq(commands.id, row.id)); return null; }
    const claimToken = randomUUID();
    const [claimed] = await tx.update(commands).set({ claimToken, claimExpiresAt: new Date(now.getTime() + leaseMs), deliveryAttempts: sql`${commands.deliveryAttempts} + 1`, updatedAt: now }).where(eq(commands.id, row.id)).returning();
    return claimed;
  });
}

export async function markPushAttempt(db: Db, id: string, claimToken: string, success: boolean, error?: string) {
  const bounded = error?.slice(0, errorLimit) ?? null;
  const [current] = await db.select().from(commands).where(and(eq(commands.id, id), eq(commands.claimToken, claimToken))).limit(1);
  const [row] = await db.update(commands).set({ nextDeliveryAt: success ? null : new Date(Date.now() + 30_000), failureReason: success ? null : bounded, claimToken: null, claimExpiresAt: null, status: success ? "SENT" : current && current.deliveryAttempts >= 3 ? "FAILED" : "SENT", updatedAt: new Date() }).where(and(eq(commands.id, id), eq(commands.claimToken, claimToken))).returning();
  return row;
}

export async function expireCommands(db: Db, now = new Date()) { return db.update(commands).set({ status: "EXPIRED", updatedAt: now }).where(and(lte(commands.validUntil, now), or(eq(commands.status, "REQUESTED"), eq(commands.status, "SENT")))).returning(); }

export async function claimPullCommands(db: Db, projectId: string, environment: string, now = new Date(), limit = 20) {
  return db.transaction(async (tx) => {
    await tx.update(commands).set({ status: "EXPIRED", updatedAt: now }).where(and(eq(commands.projectId, projectId), eq(commands.environment, environment), lte(commands.validUntil, now), or(eq(commands.status, "REQUESTED"), eq(commands.status, "SENT"))));
    const rows = await tx.select().from(commands).where(and(eq(commands.projectId, projectId), eq(commands.environment, environment), eq(commands.deliveryMode, "PULL"), eq(commands.status, "REQUESTED"))).orderBy(asc(commands.requestedAt)).limit(limit).for("update", { skipLocked: true });
    if (!rows.length) return [];
    return tx.update(commands).set({ status: "SENT", deliveryAttempts: sql`${commands.deliveryAttempts} + 1`, updatedAt: now }).where(and(inArray(commands.id, rows.map((r) => r.id)), eq(commands.status, "REQUESTED"))).returning();
  });
}

export async function transitionCommand(db: Db, commandId: string, projectId: string, environment: string, fromStatus: string, status: string, fields: Partial<typeof commands.$inferInsert>) {
  const [row] = await db.update(commands).set({ ...fields, status, updatedAt: new Date() }).where(and(eq(commands.commandId, commandId), eq(commands.projectId, projectId), eq(commands.environment, environment), eq(commands.status, fromStatus))).returning();
  return row;
}
