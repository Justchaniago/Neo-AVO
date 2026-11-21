import { z } from "zod";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { credentialsEqual } from "../config/operator-auth";
import { withConfiguredDb } from "../db/client";
import * as schema from "../db/schema";
import { hashPassword, verifyPassword } from "./password";

type Db = NodePgDatabase<typeof schema>;
type Stored = { username: string; passwordHash: string; updatedAt: Date };
export type OperatorAuth =
  | { kind: "stored"; username: string; passwordHash: string; updatedAt: Date }
  | { kind: "env"; username: string; password: string }
  | { kind: "unconfigured" }
  | { kind: "unavailable" };

const ROW_ID = "operator";
const CACHE_TTL_MS = 10_000;
const cache = globalThis as typeof globalThis & {
  __neoAvoOperatorStored?: { value: Stored | null; loadedAt: number };
  __neoAvoOperatorVerified?: { passwordHash: string; credentials: string };
};

export const changeCredentialsSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newUsername: z.string().trim().min(1).max(100).regex(/^[^:]+$/).optional(),
  newPassword: z.string().min(16).max(1024),
}).strict();

function envCredentials() {
  const username = process.env.NEO_AVO_OPERATOR_USERNAME;
  const password = process.env.NEO_AVO_OPERATOR_PASSWORD;
  return username && !username.includes(":") && password && password.length >= 16 ? { username, password } : null;
}

function isMissingTable(error: unknown) {
  const code = (value: unknown) => (value as { code?: string } | null)?.code;
  return code(error) === "42P01" || code((error as { cause?: unknown } | null)?.cause) === "42P01";
}

export async function findStoredCredentials(db: Db): Promise<Stored | null> {
  const row = await db.query.operatorCredentials.findFirst();
  return row ? { username: row.username, passwordHash: row.passwordHash, updatedAt: row.updatedAt } : null;
}

async function loadStored(): Promise<Stored | null> {
  const cached = cache.__neoAvoOperatorStored;
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.value;
  let value: Stored | null;
  try {
    value = await withConfiguredDb(findStoredCredentials);
  } catch (error) {
    if (!isMissingTable(error)) {
      if (cached) return cached.value;
      throw error;
    }
    value = null;
  }
  cache.__neoAvoOperatorStored = { value, loadedAt: Date.now() };
  return value;
}

export function clearOperatorAuthCache() {
  cache.__neoAvoOperatorStored = undefined;
  cache.__neoAvoOperatorVerified = undefined;
}

/** Credentials saved from Settings replace the environment ones; the environment values only bootstrap the first login. */
export async function resolveOperatorAuth(): Promise<OperatorAuth> {
  const env = envCredentials();
  if (process.env.DATABASE_URL) {
    try {
      const stored = await loadStored();
      if (stored) return { kind: "stored", ...stored };
    } catch {
      return { kind: "unavailable" };
    }
  }
  return env ? { kind: "env", ...env } : { kind: "unconfigured" };
}

export async function verifyOperatorCredentials(auth: OperatorAuth, supplied: string) {
  if (auth.kind === "env") return credentialsEqual(supplied, `${auth.username}:${auth.password}`);
  if (auth.kind !== "stored") return false;
  const verified = cache.__neoAvoOperatorVerified;
  if (verified?.passwordHash === auth.passwordHash && (await credentialsEqual(supplied, verified.credentials))) return true;
  const separator = supplied.indexOf(":");
  if (separator < 0) return false;
  const usernameMatches = await credentialsEqual(supplied.slice(0, separator), auth.username);
  const passwordMatches = await verifyPassword(supplied.slice(separator + 1), auth.passwordHash);
  if (!usernameMatches || !passwordMatches) return false;
  cache.__neoAvoOperatorVerified = { passwordHash: auth.passwordHash, credentials: supplied };
  return true;
}

export async function changeOperatorCredentials(db: Db, input: z.infer<typeof changeCredentialsSchema>, env = envCredentials()) {
  const stored = await findStoredCredentials(db);
  if (!stored && !env) throw new Error("operator_auth_not_configured");
  const currentMatches = stored ? await verifyPassword(input.currentPassword, stored.passwordHash) : await credentialsEqual(input.currentPassword, env!.password);
  if (!currentMatches) throw new Error("current_password_incorrect");
  const username = input.newUsername ?? stored?.username ?? env!.username;
  const passwordHash = await hashPassword(input.newPassword);
  const updatedAt = new Date();
  await db.insert(schema.operatorCredentials).values({ id: ROW_ID, username, passwordHash, updatedAt })
    .onConflictDoUpdate({ target: schema.operatorCredentials.id, set: { username, passwordHash, updatedAt } });
  clearOperatorAuthCache();
  return { username, updatedAt };
}
