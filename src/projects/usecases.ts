import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { createProjectToken, hashProjectToken, tokenHashesEqual } from "./credentials";
import { findActiveCredential, findProjectById, insertCredential, insertProject, revokeCredentials, updateProject } from "./repository";
import type { ProjectConfig, ProjectUpdate } from "./types";

type Db = NodePgDatabase<typeof schema>;

export async function registerProject(db: Db, config: ProjectConfig) {
  return db.transaction(async (tx) => {
    const project = await insertProject(tx, config);
    const generated = createProjectToken();
    await insertCredential(tx, { projectId: project.id, environment: project.environment, tokenPrefix: generated.prefix, tokenHash: generated.hash });
    return { project, token: generated.token };
  });
}

export async function getProject(db: Db, projectId: string) {
  return findProjectById(db, projectId);
}

export async function updateProjectConfig(db: Db, projectId: string, changes: ProjectUpdate) {
  return updateProject(db, projectId, changes);
}

export async function authenticateProject(db: Db, projectId: string, environment: string, token: string) {
  const credential = await findActiveCredential(db, projectId, environment);
  if (!credential || !tokenHashesEqual(credential.tokenHash, hashProjectToken(token))) return null;
  return findProjectById(db, projectId);
}

export async function rotateProjectCredential(db: Db, projectId: string, environment: string) {
  const generated = createProjectToken();
  await db.transaction(async (tx) => {
    await revokeCredentials(tx, projectId, environment);
    await insertCredential(tx, { projectId, environment, tokenPrefix: generated.prefix, tokenHash: generated.hash });
  });
  return generated.token;
}
