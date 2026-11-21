import { NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../src/db/client";
import { resolveAllIncidentsAndEvents } from "../../../../../../src/incidents/usecases";

export async function POST(request: Request) {
  let body: { projectId?: string; resolutionNote?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  try {
    const result = await withConfiguredDb((db) =>
      resolveAllIncidentsAndEvents(db, {
        projectId: body.projectId,
        resolutionNote: body.resolutionNote,
      }),
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error resolving incidents and events";
    return NextResponse.json({ error: "bulk_resolution_failed", message }, { status: 500 });
  }
}
