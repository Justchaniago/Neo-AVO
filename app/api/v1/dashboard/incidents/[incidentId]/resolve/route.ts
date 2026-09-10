import { NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../../src/db/client";
import { manuallyResolveIncident } from "../../../../../../../src/incidents/usecases";

type Context = { params: Promise<{ incidentId: string }> };

export async function POST(request: Request, context: Context) {
  const { incidentId } = await context.params;
  let body: { resolutionNote?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }
  const incident = await withConfiguredDb((db) =>
    manuallyResolveIncident(db, incidentId, { resolutionNote: body.resolutionNote }),
  );
  if (!incident) return NextResponse.json({ error: "incident_already_resolved_or_not_found" }, { status: 409 });
  return NextResponse.json({ incident });
}
