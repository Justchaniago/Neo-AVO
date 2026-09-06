import { NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../src/db/client";
import { getProjectDetail } from "../../../../../../src/dashboard/repository";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  const { projectId } = await context.params;
  const result = await withConfiguredDb((db) => getProjectDetail(db, projectId));
  if (!result) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  return NextResponse.json(result);
}
