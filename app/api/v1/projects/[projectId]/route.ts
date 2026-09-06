import { NextRequest, NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../src/db/client";
import { authenticateProjectRequest } from "../../../../../src/projects/auth";
import { updateProjectConfig } from "../../../../../src/projects/usecases";
import { projectUpdateSchema } from "../../../../../src/projects/types";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  const project = await authenticateProjectRequest(request, projectId);
  if (!project) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  const authenticated = await authenticateProjectRequest(request, projectId);
  if (!authenticated) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = projectUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_project_config", details: parsed.error.flatten() }, { status: 400 });
  const project = await withConfiguredDb((db) => updateProjectConfig(db, projectId, parsed.data));
  return NextResponse.json({ project });
}
