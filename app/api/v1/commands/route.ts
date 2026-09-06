import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withConfiguredDb } from "../../../../src/db/client";
import { requestCommand } from "../../../../src/commands/usecases";

const requestSchema = z.object({ projectId: z.string().uuid(), environment: z.string().min(1), capability: z.string().min(1).max(100), arguments: z.unknown(), validUntil: z.coerce.date() }).strict();

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_command_request", details: parsed.error.flatten() }, { status: 400 });
  try { const command = await withConfiguredDb((db) => requestCommand(db, parsed.data)); return NextResponse.json({ command }, { status: 201 }); }
  catch (error) { const message = error instanceof Error ? error.message : "command_rejected"; const status = message === "project_environment_mismatch" ? 403 : message === "command_expired" ? 410 : 400; return NextResponse.json({ error: message }, { status }); }
}
