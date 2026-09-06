import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { projectCredentials, projects } from "../db/schema";
import * as schema from "../db/schema";

type Db = NodePgDatabase<typeof schema>;

export async function insertProject(db: Db, values: typeof projects.$inferInsert) {
  const [project] = await db.insert(projects).values(values).returning();
  return project;
}

export async function findProjectById(db: Db, id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return project;
}

export async function updateProject(db: Db, id: string, values: Partial<typeof projects.$inferInsert>) {
  const [project] = await db.update(projects).set({ ...values, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
  return project;
}

export async function insertCredential(db: Db, values: typeof projectCredentials.$inferInsert) {
  const [credential] = await db.insert(projectCredentials).values(values).returning();
  return credential;
}

export async function findActiveCredential(db: Db, projectId: string, environment: string) {
  const [credential] = await db
    .select()
    .from(projectCredentials)
    .where(and(eq(projectCredentials.projectId, projectId), eq(projectCredentials.environment, environment), isNull(projectCredentials.revokedAt)))
    .limit(1);
  return credential;
}

export async function revokeCredentials(db: Db, projectId: string, environment: string) {
  await db.update(projectCredentials).set({ revokedAt: new Date() }).where(and(eq(projectCredentials.projectId, projectId), eq(projectCredentials.environment, environment), isNull(projectCredentials.revokedAt)));
}
