import { and, desc, eq, gt, ne, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { incidentEvents, incidents, notifications } from "../db/schema";
import type { IncidentTrigger } from "./types";

type Db = NodePgDatabase<typeof schema>;
type QueryDb = Pick<Db, "select" | "insert" | "update">;

export async function findDeduplicatedIncident(db: QueryDb, projectId: string, environment: string, dedupKey: string, since: Date) {
  const [incident] = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), eq(incidents.environment, environment), eq(incidents.dedupKey, dedupKey), ne(incidents.state, "RESOLVED"), gt(incidents.lastSeenAt, since))).orderBy(desc(incidents.lastSeenAt)).limit(1);
  return incident;
}

export async function createIncident(db: QueryDb, projectId: string, environment: string, trigger: IncidentTrigger, eventId: string, now: Date) {
  const [incident] = await db.insert(incidents).values({ projectId, environment, type: trigger.type, dedupKey: trigger.dedupKey, severity: trigger.severity, state: "OPEN", reason: trigger.reason, dependencyKey: trigger.dependencyKey ?? null, taskId: trigger.taskId ?? null, errorSignature: trigger.errorSignature ?? null, firstSeenAt: now, lastSeenAt: now, occurrenceCount: 1 }).returning();
  await linkIncidentEvent(db, incident.id, eventId);
  return incident;
}

export async function updateIncident(db: QueryDb, incidentId: string, trigger: IncidentTrigger, eventId: string, now: Date) {
  const linked = await linkIncidentEvent(db, incidentId, eventId);
  if (!linked) {
    const [existing] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
    return existing;
  }
  const [incident] = await db.update(incidents).set({ lastSeenAt: now, occurrenceCount: sql`${incidents.occurrenceCount} + 1`, reason: trigger.reason, updatedAt: now }).where(eq(incidents.id, incidentId)).returning();
  return incident;
}

export async function linkIncidentEvent(db: QueryDb, incidentId: string, eventId: string) {
  const [linked] = await db.insert(incidentEvents).values({ incidentId, eventId }).onConflictDoNothing({ target: [incidentEvents.incidentId, incidentEvents.eventId] }).returning({ id: incidentEvents.id });
  return linked;
}

export async function createNotification(db: QueryDb, values: typeof notifications.$inferInsert) {
  const [notification] = await db.insert(notifications).values(values).onConflictDoNothing({ target: [notifications.incidentId, notifications.kind] }).returning();
  return notification;
}

export async function findOpenIncidentByKey(db: QueryDb, projectId: string, environment: string, dedupKey: string) {
  const [incident] = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), eq(incidents.environment, environment), eq(incidents.dedupKey, dedupKey), or(eq(incidents.state, "OPEN"), eq(incidents.state, "ACKNOWLEDGED")))).limit(1);
  return incident;
}

export async function resolveIncident(db: QueryDb, incidentId: string, eventId: string, reason: string, now: Date) {
  const [incident] = await db.update(incidents).set({ state: "RESOLVED", resolvedAt: now, resolutionReason: reason, updatedAt: now }).where(and(eq(incidents.id, incidentId), ne(incidents.state, "RESOLVED"))).returning();
  if (!incident) return null;
  await linkIncidentEvent(db, incident.id, eventId);
  await createNotification(db, { incidentId: incident.id, kind: "recovery", dedupKey: `${incident.id}:recovery`, severity: incident.severity, message: `RESOLVED: ${incident.reason}` });
  return incident;
}

export async function listIncidents(db: QueryDb, projectId?: string) {
  return db.select().from(incidents).where(projectId ? eq(incidents.projectId, projectId) : undefined).orderBy(desc(incidents.lastSeenAt)).limit(100);
}

export async function findIncident(db: QueryDb, incidentId: string) {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  return incident;
}

export async function listIncidentEvents(db: QueryDb, incidentId: string) {
  return db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, incidentId)).orderBy(desc(incidentEvents.linkedAt)).limit(100);
}
