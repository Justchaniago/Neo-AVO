import { NextRequest, NextResponse } from "next/server";
import { authenticateProjectTokenRequest } from "../../../../../../src/projects/auth";
import { withConfiguredDb } from "../../../../../../src/db/client";
import { recordCommandResult } from "../../../../../../src/commands/usecases";
import { resultSchema } from "../../../../../../src/commands/types";

type Context = { params: Promise<{ commandId: string }> };
export async function POST(request: NextRequest, context: Context) {
  const project = await authenticateProjectTokenRequest(request); if (!project) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = resultSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "invalid_result" }, { status: 400 });
  const { commandId } = await context.params;
  try { const command = await withConfiguredDb((db) => recordCommandResult(db, commandId, project.id, project.environment, parsed.data)); return NextResponse.json({ command }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "result_rejected" }, { status: 409 }); }
}
