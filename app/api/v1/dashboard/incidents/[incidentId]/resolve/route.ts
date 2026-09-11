import { NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../../src/db/client";
import { manuallyResolveIncident } from "../../../../../../../src/incidents/usecases";

type Context = { params: Promise<{ incidentId: string }> };

export async function POST(request: Request, context: Context) {
  const { incidentId } = await context.params;
  let body: { resolutionNote?: string; note?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }
  const note = body.resolutionNote ?? body.note;
  try {
    const incident = await withConfiguredDb((db) =>
      manuallyResolveIncident(db, incidentId, { resolutionNote: note }),
    );
    if (!incident) return NextResponse.json({ error: "incident_already_resolved_or_not_found" }, { status: 409 });
    return NextResponse.json({ incident });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error resolving incident";
    return NextResponse.json({ error: "resolution_failed", message }, { status: 500 });
  }
}
