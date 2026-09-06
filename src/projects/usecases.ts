import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { createProjectToken, hashProjectToken, tokenHashesEqual } from "./credentials";
import { findActiveCredential, findProjectById, insertCredential, insertProject, revokeCredentials, updateProject } from "./repository";
import type { ProjectConfig, ProjectUpdate } from "./types";

type Db = NodePgDatabase<typeof schema>;

export async function registerProject(db: Db, config: ProjectConfig) {
  const project = await insertProject(db, config);
  const generated = createProjectToken();
  await insertCredential(db, { projectId: project.id, environment: project.environment, tokenPrefix: generated.prefix, tokenHash: generated.hash });
  return { project, token: generated.token };
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
  await revokeCredentials(db, projectId, environment);
  await insertCredential(db, { projectId, environment, tokenPrefix: generated.prefix, tokenHash: generated.hash });
  return generated.token;
}
