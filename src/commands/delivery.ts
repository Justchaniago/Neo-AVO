import { decryptCommandSecret } from "./secrets";
import { claimPushCommand, markPushAttempt } from "./repository";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { findProjectById } from "../projects/repository";
import { log } from "../observability/logger";

type Db = NodePgDatabase<typeof schema>;
export async function deliverOnePushCommand(db: Db) {
  const command = await claimPushCommand(db);
  if (!command) return null;
  const project = await findProjectById(db, command.projectId);
  if (!project?.commandEndpointUrl) { await markPushAttempt(db, command.id, command.claimToken!, false, "push_endpoint_missing"); log("error", "commands", "push_endpoint_missing", { commandId: command.commandId, projectId: command.projectId, environment: command.environment }); return command; }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const secret = decryptCommandSecret(project);
    const response = await fetch(project.commandEndpointUrl, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify({ commandId: command.commandId, projectId: command.projectId, environment: command.environment, capability: command.capability, requestedAt: command.requestedAt.toISOString(), validUntil: command.validUntil.toISOString(), arguments: command.arguments }), signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`external_project_http_${response.status}`);
    await markPushAttempt(db, command.id, command.claimToken!, true);
  } catch (error) {
    await markPushAttempt(db, command.id, command.claimToken!, false, error instanceof Error ? error.message : String(error));
    log("error", "commands", "push_delivery_failed", { commandId: command.commandId, projectId: command.projectId, environment: command.environment, errorClass: error instanceof Error ? error.name : "unknown" });
  }
  return command;
}
