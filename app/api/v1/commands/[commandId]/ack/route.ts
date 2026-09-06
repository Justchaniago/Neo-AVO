import { NextRequest, NextResponse } from "next/server";
import { authenticateProjectTokenRequest } from "../../../../../../src/projects/auth";
import { withConfiguredDb } from "../../../../../../src/db/client";
import { acknowledgeCommand } from "../../../../../../src/commands/usecases";
import { acknowledgementSchema } from "../../../../../../src/commands/types";

type Context = { params: Promise<{ commandId: string }> };
export async function POST(request: NextRequest, context: Context) {
  const project = await authenticateProjectTokenRequest(request); if (!project) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = acknowledgementSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "invalid_ack" }, { status: 400 });
  const { commandId } = await context.params;
  try { const command = await withConfiguredDb((db) => acknowledgeCommand(db, commandId, project.id, project.environment)); return NextResponse.json({ command }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "acknowledgement_failed" }, { status: 409 }); }
}
