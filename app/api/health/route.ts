import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { withConfiguredDb } from "../../../src/db/client";

export async function GET() {
  try {
    await withConfiguredDb((db) => db.execute(sql`select 1`));
    return NextResponse.json({ status: "ok", service: "web", checks: { database: "ok" } });
  } catch {
    return NextResponse.json({ status: "degraded", service: "web", checks: { database: "unavailable" } }, { status: 503 });
  }
}
