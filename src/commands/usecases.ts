import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { findProjectById } from "../projects/repository";
import { canTransition, validateCapability } from "./types";
import { findCommand, insertCommand, transitionCommand } from "./repository";

type Db = NodePgDatabase<typeof schema>;
export async function requestCommand(db: Db, input: { projectId: string; environment: string; capability: string; arguments: unknown; validUntil: Date; requestedBy?: string }) {
  const project = await findProjectById(db, input.projectId);
  if (!project || project.environment !== input.environment) throw new Error("project_environment_mismatch");
  if (input.validUntil <= new Date()) throw new Error("command_expired");
  const checked = validateCapability(input.capability, input.arguments, project.capabilities);
  if (!checked.ok) throw new Error(checked.error);
  if (project.commandDeliveryMode === "PUSH" && (!project.commandEndpointUrl || !project.commandAuthCiphertext)) throw new Error("push_configuration_missing");
  return insertCommand(db, { commandId: `cmd_${randomUUID().replaceAll("-", "")}`, projectId: project.id, environment: project.environment, capability: input.capability, arguments: checked.arguments, requestedAt: new Date(), validUntil: input.validUntil, status: "REQUESTED", deliveryMode: project.commandDeliveryMode, requestedBy: input.requestedBy ?? "operator", auditMetadata: {} });
}

export async function acknowledgeCommand(db: Db, commandId: string, projectId: string, environment: string) {
  const current = await findCommand(db, commandId);
  if (!current || current.projectId !== projectId || current.environment !== environment) throw new Error("command_not_found");
  if (current.validUntil <= new Date() && current.status !== "COMPLETED") throw new Error("command_expired");
  if (!canTransition(current.status, "ACKNOWLEDGED")) throw new Error("invalid_command_transition");
  return transitionCommand(db, commandId, projectId, environment, current.status, "ACKNOWLEDGED", { acknowledgedAt: new Date() });
}

export async function recordCommandResult(db: Db, commandId: string, projectId: string, environment: string, input: { status: "COMPLETED" | "FAILED" | "REJECTED"; result?: Record<string, unknown>; reason?: string }) {
  const current = await findCommand(db, commandId);
  if (!current || current.projectId !== projectId || current.environment !== environment) throw new Error("command_not_found");
  if (current.validUntil <= new Date()) throw new Error("command_expired");
  if (!canTransition(current.status, input.status)) throw new Error("invalid_command_transition");
  return transitionCommand(db, commandId, projectId, environment, current.status, input.status, { result: input.result ?? null, resultAt: new Date(), failureReason: input.status === "FAILED" ? input.reason ?? "external_project_failed" : null, rejectionReason: input.status === "REJECTED" ? input.reason ?? "external_project_rejected" : null });
}
