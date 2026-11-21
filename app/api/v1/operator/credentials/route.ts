import { NextRequest, NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../src/db/client";
import { log } from "../../../../../src/observability/logger";
import { changeCredentialsSchema, changeOperatorCredentials, resolveOperatorAuth } from "../../../../../src/operator/credentials";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await resolveOperatorAuth();
  if (auth.kind !== "stored" && auth.kind !== "env") return NextResponse.json({ error: "operator_auth_unavailable" }, { status: 503 });
  return NextResponse.json({ username: auth.username, source: auth.kind === "stored" ? "settings" : "environment", updatedAt: auth.kind === "stored" ? auth.updatedAt.toISOString() : null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const parsed = changeCredentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_credentials_request", details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await withConfiguredDb((db) => changeOperatorCredentials(db, parsed.data));
    return NextResponse.json({ username: result.username, updatedAt: result.updatedAt.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "current_password_incorrect") return NextResponse.json({ error: message }, { status: 403 });
    if (message === "operator_auth_not_configured") return NextResponse.json({ error: message }, { status: 503 });
    log("error", "operator-auth", "credentials_update_failed", { errorClass: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "credentials_update_failed" }, { status: 500 });
  }
}
