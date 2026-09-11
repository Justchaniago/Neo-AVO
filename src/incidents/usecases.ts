import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, ne } from "drizzle-orm";

import * as schema from "../db/schema";
import { createIncident, createNotification, findDeduplicatedIncident, findOpenIncidentByKey, resolveIncident, updateIncident } from "./repository";
import { incidentTrigger, recoveryKey, shouldNotifyImmediately, type IncidentEvent, type IncidentProject } from "./types";
import { isAnalysisEligible } from "../ops/eligibility";
import { createAnalysisIfAbsent } from "../ops/repository";

type Db = NodePgDatabase<typeof schema>;
const DEDUP_WINDOW_MS = 15 * 60 * 1000;

function telegramMessage(incident: { severity: string; type: string; reason: string; environment: string }) {
  return `[${incident.severity}] ${incident.type} (${incident.environment})\n${incident.reason}`;
}

export async function recordIncidentForEvent(db: Db, project: IncidentProject, event: IncidentEvent, now = new Date()) {
  const trigger = incidentTrigger(project, event, now);
  if (!trigger) return null;
  const existing = await findDeduplicatedIncident(db, project.id, project.environment, trigger.dedupKey, new Date(now.getTime() - DEDUP_WINDOW_MS));
  const incident = existing ? await updateIncident(db, existing.id, trigger, event.id, now) : await createIncident(db, project.id, project.environment, trigger, event.id, now);
  if (!existing && shouldNotifyImmediately(trigger.severity)) await createNotification(db, { incidentId: incident.id, kind: "initial", dedupKey: `${incident.id}:initial`, severity: trigger.severity, message: telegramMessage(incident) });
  if (!existing && isAnalysisEligible(incident.severity, incident.type)) await createAnalysisIfAbsent(db, incident.id);
  return incident;
}

export async function resolveIncidentForEvent(db: Db, project: IncidentProject, event: IncidentEvent, reason: string, now = new Date()) {
  const dedupKey = recoveryKey(project, event);
  if (!dedupKey) return null;
  const existing = await findOpenIncidentByKey(db, project.id, project.environment, dedupKey);
  return existing ? resolveIncident(db, existing.id, event.id, reason, now) : null;
}

export async function acknowledgeIncident(db: Db, incidentId: string, now = new Date()) {
  const [incident] = await db.update(schema.incidents).set({ state: "ACKNOWLEDGED", acknowledgedAt: now, updatedAt: now }).where(and(eq(schema.incidents.id, incidentId), eq(schema.incidents.state, "OPEN"))).returning();
  return incident;
}

export async function manuallyResolveIncident(
  db: Db,
  incidentId: string,
  options: { resolutionNote?: string; resolvedBy?: string } = {},
  now = new Date(),
) {
  const [existing] = await db
    .select()
    .from(schema.incidents)
    .where(and(eq(schema.incidents.id, incidentId), ne(schema.incidents.state, "RESOLVED")))
    .limit(1);

  if (!existing) return null;

  const note = options.resolutionNote?.trim();
  const resolvedBy = options.resolvedBy || "owner";
  const reasonStr = note ? `Manual owner resolution: ${note}` : "Manual owner resolution";

  const [resolved] = await db
    .update(schema.incidents)
    .set({
      state: "RESOLVED",
      resolvedAt: now,
      resolutionReason: reasonStr,
      updatedAt: now,
    })
    .where(and(eq(schema.incidents.id, incidentId), ne(schema.incidents.state, "RESOLVED")))
    .returning();

  if (!resolved) return null;

  const remainingOpen = await db
    .select()
    .from(schema.incidents)
    .where(and(eq(schema.incidents.projectId, existing.projectId), ne(schema.incidents.state, "RESOLVED")));

  if (remainingOpen.length === 0) {
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, existing.projectId))
      .limit(1);

    if (project) {
      const hasRecentSuccessAfterFailure = project.lastSuccessfulExecutionAt && project.lastFailureAt && project.lastSuccessfulExecutionAt > project.lastFailureAt;
      const targetHealth = hasRecentSuccessAfterFailure ? "HEALTHY" : "AWAITING_VERIFICATION";
      await db
        .update(schema.projects)
        .set({
          ...(project.operationalHealth === "FAILING" || project.operationalHealth === "DEGRADED" ? { operationalHealth: targetHealth } : {}),
          ...(project.businessHealth === "FAILING" || project.businessHealth === "DEGRADED" ? { businessHealth: targetHealth } : {}),
          updatedAt: now,
        })
        .where(eq(schema.projects.id, project.id));
    }
  }

  const auditEventId = `audit-manual-resolve-${incidentId}-${now.getTime()}`;
  await db
    .insert(schema.events)
    .values({
      eventId: auditEventId,
      schemaVersion: 1,
      projectId: existing.projectId,
      environment: existing.environment,
      type: "incident.manually_resolved",
      occurredAt: now,
      data: {
        incident_id: existing.id,
        project_id: existing.projectId,
        previous_status: existing.state,
        new_status: "RESOLVED",
        resolved_at: now.toISOString(),
        resolved_by: resolvedBy,
        resolution_note: note || null,
        resolution_mode: "MANUAL_OWNER_RESOLUTION",
      },
    })
    .onConflictDoNothing();

  return resolved;
}
