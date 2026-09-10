import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { events, incidents, projects, tasks, expectedExecutionContracts, projectDependencies, operationalChanges, expectedExecutionOccurrences, recoveryEvidence, incidentMemory } from "../db/schema";
import { repositoryContextForIncident } from "./repository-context";

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
  const [project] = await db.select({ id: projects.id, slug: projects.slug, name: projects.name, environment: projects.environment, runtimeMode: projects.runtimeMode, healthStrategy: projects.healthStrategy, availability: projects.availability, operationalHealth: projects.operationalHealth, businessHealth: projects.businessHealth, criticality: projects.criticality, targetRtoMinutes: projects.targetRtoMinutes, capabilities: projects.capabilities }).from(projects).where(eq(projects.id, incident.projectId)).limit(1);
  if (!project) return null;
  const recentEvents = await db.select({ eventId: events.eventId, type: events.type, occurredAt: events.occurredAt, data: events.data }).from(events).where(and(eq(events.projectId, incident.projectId), eq(events.environment, incident.environment))).orderBy(desc(events.occurredAt)).limit(20);
  const relatedTasks = await db.select({ externalTaskId: tasks.externalTaskId, type: tasks.type, status: tasks.status, currentAttempt: tasks.currentAttempt, lastError: tasks.lastError, lastErrorSignature: tasks.lastErrorSignature, lastEventAt: tasks.lastEventAt }).from(tasks).where(and(eq(tasks.projectId, incident.projectId), eq(tasks.environment, incident.environment))).orderBy(desc(tasks.lastEventAt)).limit(20);
  const [contracts, dependencies, changes, occurrences, recovery, memory, repositoryContext] = await Promise.all([
    db.select().from(expectedExecutionContracts).where(eq(expectedExecutionContracts.projectId, incident.projectId)).limit(20),
    db.select().from(projectDependencies).where(eq(projectDependencies.projectId, incident.projectId)).limit(50),
    db.select().from(operationalChanges).where(eq(operationalChanges.projectId, incident.projectId)).orderBy(desc(operationalChanges.occurredAt)).limit(20),
    db.select().from(expectedExecutionOccurrences).innerJoin(expectedExecutionContracts, eq(expectedExecutionOccurrences.contractId, expectedExecutionContracts.id)).where(eq(expectedExecutionContracts.projectId, incident.projectId)).orderBy(desc(expectedExecutionOccurrences.expectedAt)).limit(20),
    db.select().from(recoveryEvidence).where(eq(recoveryEvidence.incidentId, incident.id)).orderBy(desc(recoveryEvidence.observedAt)).limit(20),
    db.select().from(incidentMemory).where(eq(incidentMemory.fingerprint, incident.errorSignature ?? incident.type)).limit(10),
    repositoryContextForIncident(db, incident.projectId, [incident.dependencyKey ?? "", incident.type, incident.errorSignature ?? ""].filter(Boolean)),
  ]);
  return { machineFacts: { incident: { id: incident.id, type: incident.type, severity: incident.severity, state: incident.state, reason: incident.reason, occurrenceCount: incident.occurrenceCount, firstSeenAt: incident.firstSeenAt, lastSeenAt: incident.lastSeenAt, dependencyKey: incident.dependencyKey, taskId: incident.taskId, errorSignature: incident.errorSignature }, health: { availability: project.availability, operationalHealth: project.operationalHealth, businessHealth: project.businessHealth }, expectedExecutions: contracts.map(sanitizeTelemetry), expectedExecutionEvidence: occurrences.map(sanitizeTelemetry), recoveryEvidence: recovery.map(sanitizeTelemetry), recentEvents: recentEvents.map((event) => ({ ...event, data: sanitizeTelemetry(event.data) })), relatedTasks: relatedTasks.map((task) => sanitizeTelemetry(task)) }, operationalContext: { project, dependencies: dependencies.map(sanitizeTelemetry), recentChanges: changes.map(sanitizeTelemetry), historicalSimilarity: memory.map((item) => ({ label: "HISTORICAL SIMILARITY", evidence: sanitizeTelemetry(item) })), correlations: changes.filter((change) => change.occurredAt <= incident.firstSeenAt).map((change) => `CORRELATED: ${change.kind} ${change.summary} occurred ${Math.round((incident.firstSeenAt.getTime() - change.occurredAt.getTime()) / 60_000)} minutes before incident`) }, repositoryContext, relatedOperationalSignals: [{ name: "incident_occurrence_count", value: incident.occurrenceCount }] };
}
