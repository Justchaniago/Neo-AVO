import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { OperatorAuth } from "./credentials";

export const SESSION_COOKIE = "neo_avo_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type ActiveAuth = Extract<OperatorAuth, { kind: "stored" | "env" }>;

// The key is derived from the current login, so changing the username or password signs every session out.
function sign(auth: ActiveAuth, expiresAt: number) {
  const secret = auth.kind === "stored" ? auth.passwordHash : auth.password;
  const key = createHash("sha256").update(`neo-avo-operator-session\n${auth.username}\n${secret}`).digest();
  return createHmac("sha256", key).update(`v1.${expiresAt}`).digest();
}

export function createSessionToken(auth: ActiveAuth, now = Date.now()) {
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;
  return `v1.${expiresAt}.${sign(auth, expiresAt).toString("base64url")}`;
}

export function verifySessionToken(auth: OperatorAuth, token: string | undefined, now = Date.now()) {
  if (!token || (auth.kind !== "stored" && auth.kind !== "env")) return false;
  const match = token.match(/^v1\.(\d{1,16})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= now) return false;
  return timingSafeEqual(Buffer.from(match[2], "base64url"), sign(auth, expiresAt));
}

export { safeNextPath } from "./next-path";
