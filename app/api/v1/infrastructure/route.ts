import { NextResponse } from "next/server";
import { withConfiguredDb } from "../../../../src/db/client";
import { desc, eq } from "drizzle-orm";
import * as schema from "../../../../src/db/schema";
import { getHostEntity, MONITORED_SERVICES } from "../../../../src/ops/resources";

export async function GET() {
  const result = await withConfiguredDb(async (db) => {
    const host = getHostEntity();
    const snapshots = await db
      .select()
      .from(schema.resourceSnapshots)
      .where(eq(schema.resourceSnapshots.scope, "neo-avo-host"))
      .orderBy(desc(schema.resourceSnapshots.observedAt))
      .limit(100);

    const latest = snapshots[0] || null;

    return {
      host,
      monitoredServices: MONITORED_SERVICES,
      latestSnapshot: latest ? {
        cpuPercent: latest.cpuPercent,
        memoryPercent: latest.memoryPercent,
        diskPercent: latest.diskPercent,
        serviceState: latest.serviceState,
        observedAt: latest.observedAt,
      } : null,
      history: snapshots.map(s => ({
        cpuPercent: s.cpuPercent,
        memoryPercent: s.memoryPercent,
        diskPercent: s.diskPercent,
        observedAt: s.observedAt,
      })).reverse(),
    };
  });

  return NextResponse.json(result);
}
