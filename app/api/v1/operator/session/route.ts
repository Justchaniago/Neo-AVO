import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { clearFailedAttempts, clientKey, recordFailedAttempt, retryAfterSeconds } from "../../../../../src/operator/attempts";
import { resolveOperatorAuth, verifyOperatorCredentials } from "../../../../../src/operator/credentials";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken } from "../../../../../src/operator/session";

export const dynamic = "force-dynamic";

const signInSchema = z.object({ username: z.string().min(1).max(100).regex(/^[^:]+$/), password: z.string().min(1).max(1024) }).strict();
const cookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const auth = await resolveOperatorAuth();
  if (auth.kind !== "stored" && auth.kind !== "env") {
    return NextResponse.json({ error: auth.kind === "unconfigured" ? "operator_auth_not_configured" : "operator_auth_unavailable" }, { status: 503, headers: noStore });
  }
  const client = clientKey(request);
  const retryAfter = retryAfterSeconds(client);
  if (retryAfter) return NextResponse.json({ error: "too_many_attempts" }, { status: 429, headers: { ...noStore, "Retry-After": String(retryAfter) } });

  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !(await verifyOperatorCredentials(auth, `${parsed.data.username}:${parsed.data.password}`))) {
    recordFailedAttempt(client);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401, headers: noStore });
  }
  clearFailedAttempts(client);
  const response = NextResponse.json({ username: auth.username }, { headers: noStore });
  response.cookies.set(SESSION_COOKIE, createSessionToken(auth), { ...cookie, maxAge: SESSION_TTL_SECONDS });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ signedOut: true }, { headers: noStore });
  response.cookies.set(SESSION_COOKIE, "", { ...cookie, maxAge: 0 });
  return response;
}
