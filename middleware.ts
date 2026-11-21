import { NextRequest, NextResponse } from "next/server";

import { decodeBasicCredentials, isPublicRequest } from "./src/config/operator-auth";
import { beginAttempt, clientKey, recordFailedAttempt, retryAfterSeconds } from "./src/operator/attempts";
import { resolveOperatorAuth, verifyOperatorCredentials } from "./src/operator/credentials";
import { SESSION_COOKIE, isSessionGuess, verifySessionToken } from "./src/operator/session";

// Node.js runtime: stored operator credentials are read from PostgreSQL.
export const config = { runtime: "nodejs" };

const noStore = { "Cache-Control": "no-store" };
const tooManyAttempts = (retryAfter: number) =>
  NextResponse.json({ error: "too_many_attempts" }, { status: 429, headers: { ...noStore, "Retry-After": String(retryAfter) } });

// A rejected cookie is removed, so a browser holding an outdated session does not keep spending attempts.
function dropSession(response: NextResponse, token: string | undefined) {
  if (token) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicRequest(pathname, request.method)) return NextResponse.next();
  const auth = await resolveOperatorAuth();
  if (auth.kind === "unconfigured" || auth.kind === "unavailable") {
    return NextResponse.json({ error: auth.kind === "unconfigured" ? "operator_auth_not_configured" : "operator_auth_unavailable" }, { status: 503, headers: noStore });
  }
  const read = request.method === "GET" || request.method === "HEAD";
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const client = clientKey(request);
  // The session key comes from the login, so a forged cookie is a password guess and is limited like one.
  const limited = token ? retryAfterSeconds(client) : 0;
  if (limited) return tooManyAttempts(limited);
  if (verifySessionToken(auth, token)) {
    // The session cookie is sent by the browser, so cross-site writes are refused.
    if (!read && request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "cross_site_request" }, { status: 403, headers: noStore });
    return NextResponse.next();
  }
  if (isSessionGuess(token)) recordFailedAttempt(client);
  // Non-browser administrative clients keep using HTTP Basic credentials.
  const supplied = decodeBasicCredentials(request.headers.get("authorization"));
  if (supplied) {
    const attempt = beginAttempt(client);
    if (typeof attempt === "number") return tooManyAttempts(attempt);
    if (await verifyOperatorCredentials(auth, supplied)) {
      attempt();
      return NextResponse.next();
    }
  }
  if (read && !pathname.startsWith("/api/")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return dropSession(NextResponse.redirect(login, { headers: noStore }), token);
  }
  return dropSession(NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore }), token);
}
