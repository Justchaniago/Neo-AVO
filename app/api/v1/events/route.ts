import { NextRequest, NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../src/db/client";
import { authenticateProjectTokenRequest } from "../../../../src/projects/auth";
import { persistEventBatch, validateEventBatch } from "../../../../src/events/usecases";

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) return NextResponse.json({ error: "request_too_large" }, { status: 413 });

  const project = await authenticateProjectTokenRequest(request);
  if (!project) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const input = await request.json().catch(() => null);
  const validation = validateEventBatch(input, project);
  if (!validation.ok) {
    const status = validation.kind === "project_scope_mismatch" ? 403 : validation.kind === "unknown_event_type" || validation.kind === "invalid_event_data" ? 400 : 400;
    return NextResponse.json({ error: validation.kind, ...(validation.eventId ? { eventId: validation.eventId } : {}), ...(validation.details ? { details: validation.details } : {}) }, { status });
  }

  try {
    const inserted = await withConfiguredDb((db) => persistEventBatch(db, validation.events, project.id));
    return NextResponse.json({ accepted: validation.events.length, persisted: inserted.length, duplicates: validation.events.length - inserted.length }, { status: 202 });
  } catch (error) {
    console.error(JSON.stringify({ operation: "event_ingestion_persistence_failed", error: error instanceof Error ? error.message : "unknown_error" }));
    return NextResponse.json({ error: "event_persistence_failed" }, { status: 503 });
  }
}
