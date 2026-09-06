import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { events, incidents, projects, tasks } from "../db/schema";

type Db = NodePgDatabase<typeof schema>;

const SECRET_KEY = /token|secret|password|credential|authorization|api[_-]?key|private[_-]?key/i;

export function sanitizeTelemetry(value: unknown, depth = 0): unknown {
  if (depth > 2) return "[truncated]";
  if (typeof value === "string") return value.slice(0, 1000);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeTelemetry(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)).slice(0, 30).map(([key, item]) => [key, sanitizeTelemetry(item, depth + 1)]));
  return value;
}

export async function buildAnalysisContext(db: Db, incidentId: string) {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident) return null;
  const [project] = await db.select({ id: projects.id, slug: projects.slug, name: projects.name, environment: projects.environment, runtimeMode: projects.runtimeMode, healthStrategy: projects.healthStrategy, availability: projects.availability, operationalHealth: projects.operationalHealth, criticality: projects.criticality, targetRtoMinutes: projects.targetRtoMinutes, capabilities: projects.capabilities }).from(projects).where(eq(projects.id, incident.projectId)).limit(1);
  if (!project) return null;
  const recentEvents = await db.select({ eventId: events.eventId, type: events.type, occurredAt: events.occurredAt, data: events.data }).from(events).where(and(eq(events.projectId, incident.projectId), eq(events.environment, incident.environment))).orderBy(desc(events.occurredAt)).limit(20);
  const relatedTasks = await db.select({ externalTaskId: tasks.externalTaskId, type: tasks.type, status: tasks.status, currentAttempt: tasks.currentAttempt, lastError: tasks.lastError, lastErrorSignature: tasks.lastErrorSignature, lastEventAt: tasks.lastEventAt }).from(tasks).where(and(eq(tasks.projectId, incident.projectId), eq(tasks.environment, incident.environment))).orderBy(desc(tasks.lastEventAt)).limit(20);
  return { incident: { id: incident.id, type: incident.type, severity: incident.severity, state: incident.state, reason: incident.reason, occurrenceCount: incident.occurrenceCount, firstSeenAt: incident.firstSeenAt, lastSeenAt: incident.lastSeenAt, dependencyKey: incident.dependencyKey, taskId: incident.taskId, errorSignature: incident.errorSignature }, project, health: { availability: project.availability, operationalHealth: project.operationalHealth }, recentEvents: recentEvents.map((event) => ({ ...event, data: sanitizeTelemetry(event.data) })), relatedTasks: relatedTasks.map((task) => sanitizeTelemetry(task)), relatedOperationalSignals: [{ name: "incident_occurrence_count", value: incident.occurrenceCount }] };
}
