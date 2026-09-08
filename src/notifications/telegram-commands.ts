import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { events, incidents, projects } from "../db/schema";

type Db = NodePgDatabase<typeof schema>;
export type TelegramCommand = "status" | "recent" | "incidents";

const meaningfulEventTypes = ["task.failed", "task.retrying", "agent.failed", "deployment.failed", "dependency.degraded", "dependency.recovered", "project.stopped", "project.started", "event.quarantined", "tele_auto.run.failed", "tele_auto.run.effect_uncertain", "tele_auto.telegram.delivery_failed", "tele_auto.sheets.schema_mismatch", "tele_auto.worker.recovery"] as const;
const activeIncidentFilter = or(eq(incidents.state, "OPEN"), eq(incidents.state, "ACKNOWLEDGED"));

export async function buildTelegramCommandResponse(db: Db, command: TelegramCommand) {
  if (command === "status") {
    const [projectRows, openIncidents] = await Promise.all([
      db.select({ name: projects.name, environment: projects.environment, availability: projects.availability, operationalHealth: projects.operationalHealth }).from(projects).orderBy(projects.name),
      db.select({ id: incidents.id }).from(incidents).where(activeIncidentFilter),
    ]);
    const lines = projectRows.length ? projectRows.map((project) => `${project.name} [${project.environment}] ${project.availability}/${project.operationalHealth}`) : ["No registered projects"];
    return `STATUS\nActive incidents: ${openIncidents.length}\n${lines.join("\n")}`.slice(0, 3800);
  }
  if (command === "recent") {
    const rows = await db.select({ type: events.type, occurredAt: events.occurredAt, projectId: events.projectId }).from(events).where(and(isNull(events.quarantinedAt), inArray(events.type, [...meaningfulEventTypes]))).orderBy(desc(events.occurredAt)).limit(10);
    return `RECENT\n${rows.length ? rows.map((row) => `${row.occurredAt.toISOString()} ${row.projectId} ${row.type}`).join("\n") : "No meaningful recent activity"}`.slice(0, 3800);
  }
  const rows = await db.select({ projectId: incidents.projectId, environment: incidents.environment, type: incidents.type, severity: incidents.severity, state: incidents.state, reason: incidents.reason }).from(incidents).where(activeIncidentFilter).orderBy(desc(incidents.lastSeenAt)).limit(10);
  return `INCIDENTS\n${rows.length ? rows.map((row) => `[${row.severity}] ${row.projectId} ${row.environment} ${row.state} ${row.type}: ${row.reason}`).join("\n") : "No active incidents"}`.slice(0, 3800);
}
