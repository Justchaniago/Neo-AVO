import { NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../src/db/client";
import { findIncident, listIncidentEvents } from "../../../../../../src/incidents/repository";
import { findAnalysis } from "../../../../../../src/ops/repository";

type Context = { params: Promise<{ incidentId: string }> };

export async function GET(_request: Request, context: Context) {
  const { incidentId } = await context.params;
  const result = await withConfiguredDb(async (db) => {
    const incident = await findIncident(db, incidentId);
    return incident ? { incident, evidence: await listIncidentEvents(db, incidentId), analysis: await findAnalysis(db, incidentId) } : null;
  });
  if (!result) return NextResponse.json({ error: "incident_not_found" }, { status: 404 });
  return NextResponse.json(result);
}
