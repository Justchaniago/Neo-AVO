import { and, desc, eq, lt, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";

export type TimelineKind = "EVENT" | "TASK" | "EXPECTED_EXECUTION" | "CHANGE" | "INCIDENT" | "AI_ANALYSIS" | "RECOVERY" | "RESOLUTION";
export type TimelineItem = { timestamp: Date; kind: TimelineKind; severity: string | null; status: string | null; title: string; summary: string; sourceId: string; projectId: string; metadataSafe: Record<string, string | number | null> };

function bounded(limit?: number) { return Math.min(Math.max(limit ?? 100, 1), 200); }

/** Read-only normalized projection. Source tables remain authoritative. */
export async function getProjectTimeline(db: NodePgDatabase<typeof schema>, projectId: string, options: { limit?: number; before?: Date; incidentId?: string } = {}) {
  const limit = bounded(options.limit);
  const before = options.before;
  const time = <T extends { timestamp: Date }>(item: T) => !before || item.timestamp < before;
  const [events, tasks, occurrences, changes, incidentRows, analyses, recoveries] = await Promise.all([
    db.select().from(schema.events).where(and(eq(schema.events.projectId, projectId), before ? lt(schema.events.occurredAt, before) : undefined)).orderBy(desc(schema.events.occurredAt)).limit(limit),
    db.select().from(schema.tasks).where(eq(schema.tasks.projectId, projectId)).orderBy(desc(schema.tasks.lastEventAt)).limit(limit),
    db.select({ occurrence: schema.expectedExecutionOccurrences, contract: schema.expectedExecutionContracts }).from(schema.expectedExecutionOccurrences).innerJoin(schema.expectedExecutionContracts, eq(schema.expectedExecutionOccurrences.contractId, schema.expectedExecutionContracts.id)).where(eq(schema.expectedExecutionContracts.projectId, projectId)).orderBy(desc(schema.expectedExecutionOccurrences.expectedAt)).limit(limit),
    db.select().from(schema.operationalChanges).where(and(eq(schema.operationalChanges.projectId, projectId), before ? lt(schema.operationalChanges.occurredAt, before) : undefined)).orderBy(desc(schema.operationalChanges.occurredAt)).limit(limit),
    db.select().from(schema.incidents).where(and(eq(schema.incidents.projectId, projectId), options.incidentId ? eq(schema.incidents.id, options.incidentId) : undefined)).orderBy(desc(schema.incidents.lastSeenAt)).limit(limit),
    db.select({ analysis: schema.opsAnalyses, incident: schema.incidents }).from(schema.opsAnalyses).innerJoin(schema.incidents, eq(schema.opsAnalyses.incidentId, schema.incidents.id)).where(and(eq(schema.incidents.projectId, projectId), options.incidentId ? eq(schema.incidents.id, options.incidentId) : undefined)).orderBy(desc(schema.opsAnalyses.createdAt)).limit(limit),
    db.select({ recovery: schema.recoveryEvidence, incident: schema.incidents }).from(schema.recoveryEvidence).innerJoin(schema.incidents, eq(schema.recoveryEvidence.incidentId, schema.incidents.id)).where(and(eq(schema.incidents.projectId, projectId), options.incidentId ? eq(schema.incidents.id, options.incidentId) : undefined)).orderBy(desc(schema.recoveryEvidence.observedAt)).limit(limit),
  ]);
  const items: TimelineItem[] = [
    ...events.map((event) => ({ timestamp: event.occurredAt, kind: "EVENT" as const, severity: null, status: event.type, title: event.type, summary: "Project telemetry received", sourceId: event.id, projectId, metadataSafe: { eventId: event.eventId, environment: event.environment } })),
    ...tasks.map((task) => ({ timestamp: task.lastEventAt, kind: "TASK" as const, severity: null, status: task.status, title: task.type, summary: `Task ${task.externalTaskId} is ${task.status}`, sourceId: task.id, projectId, metadataSafe: { attempt: task.currentAttempt } })),
    ...occurrences.map(({ occurrence, contract }) => ({ timestamp: occurrence.completedAt ?? occurrence.missedAt, kind: "EXPECTED_EXECUTION" as const, severity: contract.severityOnMiss, status: occurrence.status, title: contract.name, summary: occurrence.status === "RECOVERED" ? "Expected execution later completed" : "Expected execution missed its grace window", sourceId: occurrence.id, projectId, metadataSafe: { expectedAt: occurrence.expectedAt.toISOString(), eventType: contract.expectedEventType } })),
    ...changes.map((change) => ({ timestamp: change.occurredAt, kind: "CHANGE" as const, severity: null, status: change.kind, title: change.kind, summary: change.summary, sourceId: change.id, projectId, metadataSafe: { externalId: change.externalId } })),
    ...incidentRows.flatMap((incident) => [
      { timestamp: incident.firstSeenAt, kind: "INCIDENT" as const, severity: incident.severity, status: incident.state, title: incident.type, summary: incident.reason, sourceId: incident.id, projectId, metadataSafe: { occurrences: incident.occurrenceCount, resolution: null } },
      ...(incident.resolvedAt ? [{ timestamp: incident.resolvedAt, kind: "RESOLUTION" as const, severity: incident.severity, status: "RESOLVED", title: incident.type, summary: incident.resolutionReason ?? "Incident resolved", sourceId: incident.id, projectId, metadataSafe: { resolution: null } }] : []),
    ]),
    ...analyses.map(({ analysis, incident }) => ({ timestamp: analysis.completedAt ?? analysis.createdAt, kind: "AI_ANALYSIS" as const, severity: incident.severity, status: analysis.status, title: "Ops Analyst investigation", summary: analysis.summary ?? analysis.error ?? "Analysis pending", sourceId: analysis.id, projectId, metadataSafe: { incidentId: incident.id, provider: analysis.provider, model: analysis.model } })),
    ...recoveries.map(({ recovery, incident }) => ({ timestamp: recovery.observedAt, kind: "RECOVERY" as const, severity: incident.severity, status: recovery.kind, title: "Recovery evidence", summary: recovery.summary, sourceId: recovery.id, projectId, metadataSafe: { incidentId: incident.id } })),
  ].filter(time) as TimelineItem[];
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  items.splice(limit);
  return { items, nextBefore: items.length === limit ? items.at(-1)?.timestamp.toISOString() ?? null : null };
}
