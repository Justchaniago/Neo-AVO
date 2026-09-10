import { NextResponse } from "next/server";
import { withConfiguredDb } from "../../../../../../../src/db/client";
import { requestAnalysisAgain } from "../../../../../../../src/ops/repository";

type Context = { params: Promise<{ incidentId: string }> };
export async function POST(_request: Request, context: Context) {
  const { incidentId } = await context.params;
  const analysis = await withConfiguredDb((db) => requestAnalysisAgain(db, incidentId));
  if (!analysis) return NextResponse.json({ error: "analysis_cooldown_or_running" }, { status: 409 });
  return NextResponse.json({ analysis });
}
