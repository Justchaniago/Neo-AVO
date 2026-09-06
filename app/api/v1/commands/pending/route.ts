import { NextRequest, NextResponse } from "next/server";
import { authenticateProjectTokenRequest } from "../../../../../src/projects/auth";
import { withConfiguredDb } from "../../../../../src/db/client";
import { claimPullCommands } from "../../../../../src/commands/repository";

export async function GET(request: NextRequest) {
  const project = await authenticateProjectTokenRequest(request);
  if (!project) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const commands = await withConfiguredDb((db) => claimPullCommands(db, project.id, project.environment));
  return NextResponse.json({ commands });
}
