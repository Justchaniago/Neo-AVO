import { NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../src/db/client";
import { findIncident, listIncidentEvents } from "../../../../../../src/incidents/repository";

type Context = { params: Promise<{ incidentId: string }> };

export async function GET(_request: Request, context: Context) {
  const { incidentId } = await context.params;
  const result = await withConfiguredDb(async (db) => {
    const incident = await findIncident(db, incidentId);
    return incident ? { incident, evidence: await listIncidentEvents(db, incidentId) } : null;
  });
  if (!result) return NextResponse.json({ error: "incident_not_found" }, { status: 404 });
  return NextResponse.json(result);
}
