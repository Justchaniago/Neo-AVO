import { NextRequest, NextResponse } from "next/server";

import { decodeBasicCredentials, isPublicRequest } from "./src/config/operator-auth";
import { resolveOperatorAuth, verifyOperatorCredentials } from "./src/operator/credentials";

// Node.js runtime: stored operator credentials are read from PostgreSQL.
export const config = { runtime: "nodejs" };

export async function middleware(request: NextRequest) {
  if (isPublicRequest(request.nextUrl.pathname, request.method)) return NextResponse.next();
  const auth = await resolveOperatorAuth();
  if (auth.kind === "unconfigured" || auth.kind === "unavailable") {
    return NextResponse.json({ error: auth.kind === "unconfigured" ? "operator_auth_not_configured" : "operator_auth_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const supplied = decodeBasicCredentials(request.headers.get("authorization"));
  if (!supplied || !(await verifyOperatorCredentials(auth, supplied))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Neo AVO", charset="UTF-8"', "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}
