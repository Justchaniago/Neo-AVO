import { and, inArray, isNotNull, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { createProjectToken, hashProjectToken, tokenHashesEqual } from "./credentials";
import { findActiveCredential, findProjectById, insertCredential, insertProject, revokeCredentials, updateProject } from "./repository";
import type { ProjectConfig, ProjectUpdate } from "./types";
import { encryptCommandSecret } from "../commands/secrets";
import { isValidCommandEndpoint } from "./command-endpoint";
import { requestCommand } from "../commands/usecases";

type Db = NodePgDatabase<typeof schema>;

export async function registerProject(db: Db, config: ProjectConfig) {
  if (config.commandEndpointUrl !== undefined && !isValidCommandEndpoint(config.commandEndpointUrl)) throw new Error("invalid_command_endpoint");
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
  if (changes.commandEndpointUrl !== undefined && !isValidCommandEndpoint(changes.commandEndpointUrl)) throw new Error("invalid_command_endpoint");
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

export async function pauseProject(
  db: Db,
  projectId: string,
  options: { reason?: string; durationMinutes?: number; requestedBy?: string } = {},
  now = new Date(),
) {
  const project = await findProjectById(db, projectId);
  if (!project) return null;

  const pausedUntil = options.durationMinutes && options.durationMinutes > 0
    ? new Date(now.getTime() + options.durationMinutes * 60_000)
    : null;
  const supportsPauseCmd = project.capabilities.includes("runtime.pause");
  const nextControlState = supportsPauseCmd ? "PAUSE_REQUESTED" : "PAUSED";

  const updated = await updateProject(db, project.id, {
    controlState: nextControlState,
    pausedAt: now,
    pausedUntil,
    pauseReason: options.reason?.trim() || null,
  });

  let command = null;
  if (supportsPauseCmd) {
    command = await requestCommand(db, {
      projectId: project.id,
      environment: project.environment,
      capability: "runtime.pause",
      arguments: {
        ...(options.reason?.trim() ? { reason: options.reason.trim() } : {}),
        ...(pausedUntil ? { until: pausedUntil.toISOString() } : {}),
      },
      validUntil: new Date(now.getTime() + 15 * 60_000),
      requestedBy: options.requestedBy ?? "operator",
    });
  }

  await db.insert(schema.events).values({
    eventId: `ctrl-pause-${project.id}-${now.getTime()}-${randomUUID().slice(0, 8)}`,
    schemaVersion: 1,
    projectId: project.id,
    environment: project.environment,
    type: "project.paused",
    occurredAt: now,
    data: {
      reason: options.reason?.trim() || null,
      pausedUntil: pausedUntil?.toISOString() || null,
      requestedBy: options.requestedBy ?? "operator",
    },
  }).onConflictDoNothing();

  return { project: updated ? toPublicProject(updated) : null, command };
}

export async function resumeProject(
  db: Db,
  projectId: string,
  options: { reason?: string; requestedBy?: string; isAuto?: boolean } = {},
  now = new Date(),
) {
  const project = await findProjectById(db, projectId);
  if (!project) return null;

  const updated = await updateProject(db, project.id, {
    controlState: "ACTIVE",
    pausedAt: null,
    pausedUntil: null,
    pauseReason: null,
    lastResumedAt: now,
  });

  let command = null;
  if (project.capabilities.includes("runtime.resume")) {
    command = await requestCommand(db, {
      projectId: project.id,
      environment: project.environment,
      capability: "runtime.resume",
      arguments: {
        ...(options.reason?.trim() ? { reason: options.reason.trim() } : {}),
      },
      validUntil: new Date(now.getTime() + 15 * 60_000),
      requestedBy: options.requestedBy ?? (options.isAuto ? "auto_ttl" : "operator"),
    });
  }

  await db.insert(schema.events).values({
    eventId: `ctrl-resume-${project.id}-${now.getTime()}-${randomUUID().slice(0, 8)}`,
    schemaVersion: 1,
    projectId: project.id,
    environment: project.environment,
    type: options.isAuto ? "project.auto_resumed" : "project.resumed",
    occurredAt: now,
    data: {
      reason: options.reason?.trim() || null,
      requestedBy: options.requestedBy ?? (options.isAuto ? "auto_ttl" : "operator"),
    },
  }).onConflictDoNothing();

  return { project: updated ? toPublicProject(updated) : null, command };
}

export async function startProject(
  db: Db,
  projectId: string,
  options: { target?: string; store?: "ALL" | "PMS" | "TP6"; requestedBy?: string } = {},
  now = new Date(),
) {
  const project = await findProjectById(db, projectId);
  if (!project) return null;
  if (project.controlState === "PAUSED" || project.controlState === "PAUSE_REQUESTED") {
    throw new Error("project_is_paused");
  }
  const command = await requestCommand(db, {
    projectId: project.id,
    environment: project.environment,
    capability: "runtime.start",
    arguments: {
      ...(options.target ? { target: options.target } : {}),
      ...(options.store ? { store: options.store } : {}),
    },
    validUntil: new Date(now.getTime() + 15 * 60_000),
    requestedBy: options.requestedBy ?? "operator",
  });
  return { project: toPublicProject(project), command };
}

export async function autoResumeExpiredProjects(db: Db, now = new Date()) {
  const expired = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        inArray(schema.projects.controlState, ["PAUSED", "PAUSE_REQUESTED"]),
        isNotNull(schema.projects.pausedUntil),
        lte(schema.projects.pausedUntil, now),
      ),
    );
  for (const row of expired) {
    await resumeProject(db, row.id, { reason: "Auto-resumed after pause TTL expired", isAuto: true }, now);
  }
  return expired.length;
}
