import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function createProjectToken() {
  const secret = randomBytes(TOKEN_BYTES).toString("base64url");
  const token = `neo_${secret}`;
  return { token, prefix: token.slice(0, 12), hash: hashProjectToken(token) };
}

export function hashProjectToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenHashesEqual(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
