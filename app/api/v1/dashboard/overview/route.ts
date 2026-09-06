import { NextResponse } from "next/server";

import { withConfiguredDb } from "../../../../../src/db/client";
import { getOverview } from "../../../../../src/dashboard/repository";

export async function GET() {
  const result = await withConfiguredDb(getOverview);
  return NextResponse.json(result);
}
