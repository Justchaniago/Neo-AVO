import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { insertEvents } from "./repository";
import { eventBatchSchema, validateEventData } from "./types";

type Db = NodePgDatabase<typeof schema>;

export function validateEventBatch(input: unknown, project: { id: string; slug: string; environment: string }) {
  const parsed = eventBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, kind: "invalid_envelope", details: parsed.error.flatten() };

  const projectMismatch = parsed.data.events.find((event) => (event.projectId !== project.id && event.projectId !== project.slug) || event.environment !== project.environment);
  if (projectMismatch) return { ok: false as const, kind: "project_scope_mismatch", eventId: projectMismatch.eventId };

  const normalizedEvents = [];
  for (const event of parsed.data.events) {
    const validation = validateEventData(event);
    if (!validation.ok) return { ok: false as const, kind: validation.error, eventId: event.eventId, details: "details" in validation ? validation.details : undefined };
    normalizedEvents.push({ ...event, data: validation.data });
  }

  return { ok: true as const, events: normalizedEvents };
}

export async function persistEventBatch(db: Db, events: Awaited<ReturnType<typeof eventBatchSchema.parse>>["events"], projectId: string) {
  return db.transaction(async (tx) => insertEvents(tx, events.map((event) => ({
    eventId: event.eventId,
    schemaVersion: event.schemaVersion,
    projectId,
    environment: event.environment,
    type: event.type,
    occurredAt: new Date(event.occurredAt),
    sequence: event.sequence === undefined ? null : String(event.sequence),
    data: event.data,
  }))));
}
