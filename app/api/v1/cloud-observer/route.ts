import { NextResponse } from "next/server";
import { withConfiguredDb } from "../../../../src/db/client";
import { readLatestCloudObserver } from "../../../../src/cloud-observer/repository";

export async function GET() {
  const snapshot = await withConfiguredDb((db) => readLatestCloudObserver(db));
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
