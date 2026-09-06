import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { createProjectToken, hashProjectToken, tokenHashesEqual } from "./credentials";
import { findActiveCredential, findProjectById, insertCredential, insertProject, revokeCredentials, updateProject } from "./repository";
import type { ProjectConfig, ProjectUpdate } from "./types";
import { encryptCommandSecret } from "../commands/secrets";

type Db = NodePgDatabase<typeof schema>;

export async function registerProject(db: Db, config: ProjectConfig) {
  return db.transaction(async (tx) => {
    const { commandAuthSecret, commandDeliveryMode = "PULL", ...rest } = config;
    const values = { ...rest, commandDeliveryMode };
    if (commandDeliveryMode === "PUSH" && (!values.commandEndpointUrl || !commandAuthSecret)) throw new Error("PUSH projects require command endpoint and outbound auth secret");
    const project = await insertProject(tx, values);
    if (commandAuthSecret) {
      const encrypted = encryptCommandSecret(commandAuthSecret);
      await updateProject(tx, project.id, { commandAuthCiphertext: encrypted.ciphertext, commandAuthIv: encrypted.iv, commandAuthTag: encrypted.tag });
    }
    const generated = createProjectToken();
    await insertCredential(tx, { projectId: project.id, environment: project.environment, tokenPrefix: generated.prefix, tokenHash: generated.hash });
    return { project: toPublicProject({ ...project, ...(commandAuthSecret ? { commandAuthCiphertext: "stored", commandAuthIv: "stored", commandAuthTag: "stored" } : {}) }), token: generated.token };
  });
}

export function toPublicProject(project: any) {
  const { commandAuthCiphertext: _ciphertext, commandAuthIv: _iv, commandAuthTag: _tag, ...publicProject } = project;
  return publicProject;
}

export async function getProject(db: Db, projectId: string) {
  const project = await findProjectById(db, projectId);
  return project ? toPublicProject(project) : project;
}

export async function updateProjectConfig(db: Db, projectId: string, changes: ProjectUpdate) {
  const { commandAuthSecret, ...values } = changes;
  if (values.commandDeliveryMode === "PUSH" && values.commandEndpointUrl && !commandAuthSecret) {
    const current = await findProjectById(db, projectId);
    if (!current?.commandAuthCiphertext) throw new Error("PUSH projects require outbound auth secret");
  }
  const project = await db.transaction(async (tx) => {
    const updated = await updateProject(tx, projectId, values);
    if (commandAuthSecret) {
      const encrypted = encryptCommandSecret(commandAuthSecret);
      return updateProject(tx, projectId, { commandAuthCiphertext: encrypted.ciphertext, commandAuthIv: encrypted.iv, commandAuthTag: encrypted.tag });
    }
    return updated;
  });
  return project ? toPublicProject(project) : project;
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
