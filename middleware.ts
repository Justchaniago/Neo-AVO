import { NextRequest, NextResponse } from "next/server";

import { decodeBasicCredentials, isPublicRequest } from "./src/config/operator-auth";
import { beginAttempt, clientKey } from "./src/operator/attempts";
import { resolveOperatorAuth, verifyOperatorCredentials } from "./src/operator/credentials";
import { SESSION_COOKIE, verifySessionToken } from "./src/operator/session";

// Node.js runtime: stored operator credentials are read from PostgreSQL.
export const config = { runtime: "nodejs" };

const noStore = { "Cache-Control": "no-store" };
const tooManyAttempts = (retryAfter: number) =>
  NextResponse.json({ error: "too_many_attempts" }, { status: 429, headers: { ...noStore, "Retry-After": String(retryAfter) } });

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicRequest(pathname, request.method)) return NextResponse.next();
  const auth = await resolveOperatorAuth();
  if (auth.kind === "unconfigured" || auth.kind === "unavailable") {
    return NextResponse.json({ error: auth.kind === "unconfigured" ? "operator_auth_not_configured" : "operator_auth_unavailable" }, { status: 503, headers: noStore });
  }
  const read = request.method === "GET" || request.method === "HEAD";
  if (verifySessionToken(auth, request.cookies.get(SESSION_COOKIE)?.value)) {
    // The session cookie is sent by the browser, so cross-site writes are refused.
    if (!read && request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "cross_site_request" }, { status: 403, headers: noStore });
    return NextResponse.next();
  }
  // Non-browser administrative clients keep using HTTP Basic credentials.
  const supplied = decodeBasicCredentials(request.headers.get("authorization"));
  if (supplied) {
    const client = clientKey(request);
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
    return NextResponse.redirect(login, { headers: noStore });
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
}
