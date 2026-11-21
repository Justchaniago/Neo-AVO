import { NextRequest, NextResponse } from "next/server";

import { credentialsEqual, decodeBasicCredentials, isPublicRequest } from "./src/config/operator-auth";

export async function middleware(request: NextRequest) {
  if (isPublicRequest(request.nextUrl.pathname, request.method)) return NextResponse.next();
  const username = process.env.NEO_AVO_OPERATOR_USERNAME;
  const password = process.env.NEO_AVO_OPERATOR_PASSWORD;
  if (!username || username.includes(":") || !password || password.length < 16) {
    return NextResponse.json({ error: "operator_auth_not_configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const supplied = decodeBasicCredentials(request.headers.get("authorization"));
  const valid = await credentialsEqual(supplied ?? "", `${username}:${password}`);
  if (!supplied || !valid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Neo AVO", charset="UTF-8"', "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}
