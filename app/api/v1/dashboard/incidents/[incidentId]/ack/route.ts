import { NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../../../src/db/client";
import { acknowledgeIncident } from "../../../../../../../src/incidents/usecases";

type Context = { params: Promise<{ incidentId: string }> };

export async function POST(_request: Request, context: Context) {
  const { incidentId } = await context.params;
  const incident = await withConfiguredDb((db) => acknowledgeIncident(db, incidentId));
  if (!incident) return NextResponse.json({ error: "incident_not_open" }, { status: 409 });
  return NextResponse.json({ incident });
}
