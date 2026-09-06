import { desc, eq, and, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { events, tasks } from "../db/schema";
import { listProjects, findProjectById } from "../projects/repository";

type Db = NodePgDatabase<typeof schema>;

export async function getOverview(db: Db) {
  const projects = await listProjects(db);
  return { projects };
}

export async function getProjectDetail(db: Db, projectId: string) {
  const project = await findProjectById(db, projectId);
  if (!project) return null;
  const projectTasks = await db.select().from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.environment, project.environment))).orderBy(desc(tasks.lastEventAt)).limit(50);
  const recentEvents = await db.select().from(events).where(and(eq(events.projectId, projectId), isNull(events.quarantinedAt))).orderBy(desc(events.receivedAt)).limit(50);
  return { project, tasks: projectTasks, recentEvents };
}
