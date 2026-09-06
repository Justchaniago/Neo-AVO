import { NextRequest, NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../src/db/client";
import { registerProject } from "../../../../src/projects/usecases";
import { projectConfigSchema } from "../../../../src/projects/types";

export async function POST(request: NextRequest) {
  const parsed = projectConfigSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_project_config", details: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await withConfiguredDb((db) => registerProject(db, parsed.data));
    return NextResponse.json({ project: result.project, token: result.token }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("projects_slug_unique")) return NextResponse.json({ error: "project_slug_exists" }, { status: 409 });
    throw error;
  }
}
