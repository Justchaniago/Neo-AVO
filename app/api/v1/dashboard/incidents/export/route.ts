import { NextRequest, NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../src/db/client";
import { listIncidents } from "../../../../../../src/incidents/repository";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
  const incidents = await withConfiguredDb((db) => listIncidents(db, projectId));

  const jsonString = JSON.stringify(incidents, null, 2);
  const filename = `neo-avo-issues-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(jsonString, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
