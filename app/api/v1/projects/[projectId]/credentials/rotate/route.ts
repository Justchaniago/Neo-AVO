import { NextRequest, NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../../src/db/client";
import { authenticateProjectRequest } from "../../../../../../../src/projects/auth";
import { rotateProjectCredential } from "../../../../../../../src/projects/usecases";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  const authenticated = await authenticateProjectRequest(request, projectId);
  if (!authenticated) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = await withConfiguredDb((db) => rotateProjectCredential(db, projectId, authenticated.environment));
  return NextResponse.json({ token }, { status: 201 });
}
