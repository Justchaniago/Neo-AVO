import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withConfiguredDb } from "../../../../../../../src/db/client";
import { pauseProject, resumeProject, startProject } from "../../../../../../../src/projects/usecases";

type Context = { params: Promise<{ projectId: string }> };

const controlSchema = z.object({
  action: z.enum(["pause", "resume", "start"]),
  reason: z.string().trim().max(500).optional(),
  durationMinutes: z.number().int().positive().max(10_080).optional(),
  target: z.string().trim().max(100).optional(),
  store: z.enum(["ALL", "PMS", "TP6"]).optional(),
}).strict();

export async function POST(request: NextRequest, context: Context) {
  const { projectId } = await context.params;
  const parsed = controlSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_control_request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await withConfiguredDb(async (db) => {
      if (parsed.data.action === "pause") {
        return pauseProject(db, projectId, {
          reason: parsed.data.reason,
          durationMinutes: parsed.data.durationMinutes,
        });
      }
      if (parsed.data.action === "resume") {
        return resumeProject(db, projectId, { reason: parsed.data.reason });
      }
      return startProject(db, projectId, {
        target: parsed.data.target,
        store: parsed.data.store,
      });
    });

    if (!result) {
      return NextResponse.json({ error: "project_not_found" }, { status: 404 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "control_action_failed";
    const status = message === "project_is_paused" ? 409 : message === "unsupported_capability" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
