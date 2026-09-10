import { desc, eq, and, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { commands, events, tasks, incidents, expectedExecutionContracts, projectDependencies, operationalChanges, recoveryEvidence } from "../db/schema";
import { listProjects, findProjectById } from "../projects/repository";
import { getProjectTimeline } from "./timeline";

type Db = NodePgDatabase<typeof schema>;

export async function getOverview(db: Db) {
  const projects = await listProjects(db);
  return { projects: projects.map((project) => { const { commandAuthCiphertext: _c, commandAuthIv: _i, commandAuthTag: _t, ...safe } = project; return safe; }) };
}

export async function getProjectDetail(db: Db, projectId: string) {
  const project = await findProjectById(db, projectId);
  if (!project) return null;
  const projectTasks = await db.select().from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.environment, project.environment))).orderBy(desc(tasks.lastEventAt)).limit(50);
  const recentEvents = await db.select().from(events).where(and(eq(events.projectId, projectId), isNull(events.quarantinedAt))).orderBy(desc(events.receivedAt)).limit(50);
  const recentCommands = await db.select().from(commands).where(and(eq(commands.projectId, projectId), eq(commands.environment, project.environment))).orderBy(desc(commands.requestedAt)).limit(50);
  const activeIncidents = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), eq(incidents.environment, project.environment))).orderBy(desc(incidents.lastSeenAt)).limit(20);
  const contracts = await db.select().from(expectedExecutionContracts).where(eq(expectedExecutionContracts.projectId, projectId)).limit(50);
  const dependencies = await db.select().from(projectDependencies).where(eq(projectDependencies.projectId, projectId)).limit(50);
  const changes = await db.select().from(operationalChanges).where(eq(operationalChanges.projectId, projectId)).orderBy(desc(operationalChanges.occurredAt)).limit(20);
  const activity = recentEvents.map((event) => {
    const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
    return { id: event.id, eventId: event.eventId, type: event.type, occurredAt: event.occurredAt, receivedAt: event.receivedAt, sequence: event.sequence, runId: typeof data.runId === "string" ? data.runId : null, store: typeof data.store === "string" ? data.store : null, domain: typeof data.domain === "string" ? data.domain : null, status: typeof data.status === "string" ? data.status : null, severity: typeof data.severity === "string" ? data.severity : null };
  });
  return { project: (() => { const { commandAuthCiphertext: _c, commandAuthIv: _i, commandAuthTag: _t, ...safe } = project; return safe; })(), tasks: projectTasks, recentEvents: activity, incidents: activeIncidents, expectedExecutions: contracts, dependencies, changes, recoveryEvidence: await db.select().from(recoveryEvidence).where(eq(recoveryEvidence.incidentId, activeIncidents[0]?.id ?? "00000000-0000-0000-0000-000000000000")).limit(20), timeline: await getProjectTimeline(db, projectId, { limit: 100 }), commands: recentCommands.map((c) => ({ id: c.id, commandId: c.commandId, capability: c.capability, arguments: c.arguments as Record<string, unknown> | null, status: c.status, requestedAt: c.requestedAt.toISOString(), result: c.result as Record<string, unknown> | null, failureReason: c.failureReason, rejectionReason: c.rejectionReason })) };
}
