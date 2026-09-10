import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { buildAnalysisContext } from "./context";
import { claimPendingAnalysis, markAnalysisFailed, markAnalysisSucceeded, recordAnalysisInvocation } from "./repository";
import { analyzeWithVertex } from "./vertex";
import { log } from "../observability/logger";

type Db = NodePgDatabase<typeof schema>;

export async function runOneOpsAnalysis(db: Db) {
  const analysis = await claimPendingAnalysis(db);
  if (!analysis) return { status: "empty" as const };
  try {
    const context = await buildAnalysisContext(db, analysis.incidentId);
    if (!context) throw new Error("analysis incident context not found");
    const result = await analyzeWithVertex(context);
    const allowed = new Set((context as { operationalContext?: { project?: { capabilities?: string[] } }; project?: { capabilities?: string[] } }).operationalContext?.project?.capabilities ?? (context as { project?: { capabilities?: string[] } }).project?.capabilities ?? []);
    const recommendedActions = result.output.recommendedActions.filter((action) => allowed.has(action.capability));
    await markAnalysisSucceeded(db, analysis.id, analysis.claimToken!, { ...result.output, recommendedActions, model: result.model });
    if (recordAnalysisInvocation) await recordAnalysisInvocation(db, { analysisId: analysis.id, trigger: analysis.attempts > 1 ? "ANALYZE_AGAIN" : "INCIDENT_GATED", model: result.model, status: "SUCCEEDED" });
    return { status: "succeeded" as const };
  } catch (error) {
    await markAnalysisFailed(db, analysis.id, analysis.claimToken!, error);
    if (recordAnalysisInvocation) await recordAnalysisInvocation(db, { analysisId: analysis.id, trigger: analysis.attempts > 1 ? "ANALYZE_AGAIN" : "INCIDENT_GATED", status: "FAILED" });
    log("error", "ops_analyst", "analysis_failed", { analysisId: analysis.id, incidentId: analysis.incidentId, errorClass: error instanceof Error ? error.name : "unknown" });
    return { status: "failed" as const, error };
  }
}
