import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";

import * as schema from "../db/schema";
import { opsAnalyses } from "../db/schema";
import type { OpsAnalysis } from "./types";

type Db = NodePgDatabase<typeof schema>;

export async function createAnalysisIfAbsent(db: Db, incidentId: string) {
  const [analysis] = await db.insert(opsAnalyses).values({ incidentId }).onConflictDoNothing({ target: opsAnalyses.incidentId }).returning();
  return analysis;
}

export async function findAnalysis(db: Db, incidentId: string) {
  const [analysis] = await db.select().from(opsAnalyses).where(eq(opsAnalyses.incidentId, incidentId)).limit(1);
  return analysis;
}

export async function claimPendingAnalysis(db: Db, now = new Date()) {
  return db.transaction(async (tx) => {
    const [analysis] = await tx.select().from(opsAnalyses).where(and(or(and(or(eq(opsAnalyses.status, "PENDING"), eq(opsAnalyses.status, "FAILED")), or(isNull(opsAnalyses.claimExpiresAt), lte(opsAnalyses.claimExpiresAt, now))), and(eq(opsAnalyses.status, "RUNNING"), lt(opsAnalyses.claimExpiresAt, now))), sql`${opsAnalyses.attempts} < 3`)).limit(1).for("update", { skipLocked: true });
    if (!analysis) return null;
    const claimToken = randomUUID();
    const [claimed] = await tx.update(opsAnalyses).set({ status: "RUNNING", claimToken, claimedAt: now, claimExpiresAt: new Date(now.getTime() + 120_000), attempts: sql`${opsAnalyses.attempts} + 1`, startedAt: now }).where(eq(opsAnalyses.id, analysis.id)).returning();
    return claimed;
  });
}

export async function markAnalysisSucceeded(db: Db, id: string, claimToken: string, result: OpsAnalysis & { model: string }) {
  const [analysis] = await db.update(opsAnalyses).set({ status: "SUCCEEDED", summary: result.summary, likelyCause: result.likelyCause, confidence: Math.round(result.confidence * 10000), impact: result.impact, recommendedActions: result.recommendedActions, facts: result.facts, hypotheses: result.hypotheses, correlations: result.correlations, relevantRepositoryFiles: result.relevantRepositoryFiles, recommendedChecks: result.recommendedChecks, safetyConstraints: result.safetyConstraints, model: result.model, error: null, completedAt: new Date(), claimToken: null, claimedAt: null, claimExpiresAt: null }).where(and(eq(opsAnalyses.id, id), eq(opsAnalyses.claimToken, claimToken))).returning();
  return analysis;
}

export async function markAnalysisFailed(db: Db, id: string, claimToken: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  const [analysis] = await db.update(opsAnalyses).set({ status: "FAILED", error: message, claimToken: null, claimedAt: null, claimExpiresAt: new Date(Date.now() + 60_000) }).where(and(eq(opsAnalyses.id, id), eq(opsAnalyses.claimToken, claimToken))).returning();
  return analysis;
}

export async function recordAnalysisInvocation(db: Db, values: typeof schema.opsAnalysisInvocations.$inferInsert) {
  await db.insert(schema.opsAnalysisInvocations).values(values);
}

/** Manual reanalysis is bounded by persisted completion time, not web-process memory. */
export async function requestAnalysisAgain(db: Db, incidentId: string, now = new Date()) {
  const [analysis] = await db.select().from(opsAnalyses).where(eq(opsAnalyses.incidentId, incidentId)).limit(1);
  if (!analysis) return createAnalysisIfAbsent(db, incidentId);
  if (analysis.status === "RUNNING" || (analysis.completedAt && now.getTime() - analysis.completedAt.getTime() < 5 * 60_000)) return null;
  const [requested] = await db.update(opsAnalyses).set({ status: "PENDING", error: null, claimToken: null, claimedAt: null, claimExpiresAt: null }).where(eq(opsAnalyses.id, analysis.id)).returning();
  return requested;
}
