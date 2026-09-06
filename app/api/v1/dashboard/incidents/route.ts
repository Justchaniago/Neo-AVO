import { NextRequest, NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../src/db/client";
import { listIncidents } from "../../../../../src/incidents/repository";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") ?? undefined;
  const incidents = await withConfiguredDb((db) => listIncidents(db, projectId));
  return NextResponse.json({ incidents });
}
