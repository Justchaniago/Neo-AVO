import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";

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
