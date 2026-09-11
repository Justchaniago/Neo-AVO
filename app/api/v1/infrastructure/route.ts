import { NextResponse } from "next/server";
import { withConfiguredDb } from "../../../../src/db/client";
import { and, desc, eq, gte } from "drizzle-orm";

import * as schema from "../../../../src/db/schema";
import { getHostEntity, MONITORED_SERVICES } from "../../../../src/ops/resources";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "24h";

  const result = await withConfiguredDb(async (db) => {
    const host = getHostEntity();
    const [latestSnapshot] = await db
      .select()
      .from(schema.resourceSnapshots)
      .where(eq(schema.resourceSnapshots.scope, "neo-avo-host"))
      .orderBy(desc(schema.resourceSnapshots.observedAt))
      .limit(1);

    let history: Array<{ cpuPercent: number; memoryPercent: number; diskPercent: number; pressureStatePeak?: string; observedAt: string }> = [];

    const now = new Date();
    if (range === "7d") {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const agg5m = await db
        .select()
        .from(schema.resourceAggregates5m)
        .where(and(eq(schema.resourceAggregates5m.hostId, host.id), gte(schema.resourceAggregates5m.bucketStart, cutoff)))
        .orderBy(desc(schema.resourceAggregates5m.bucketStart))
        .limit(300);

      history = agg5m.map((a) => ({
        cpuPercent: a.cpuPercentMean,
        memoryPercent: a.memoryPercentMean,
        diskPercent: a.diskPercentMean,
        pressureStatePeak: a.pressureStatePeak,
        observedAt: a.bucketStart.toISOString(),
      })).reverse();
    } else if (range === "30d") {
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const agg1h = await db
        .select()
        .from(schema.resourceAggregates1h)
        .where(and(eq(schema.resourceAggregates1h.hostId, host.id), gte(schema.resourceAggregates1h.bucketStart, cutoff)))
        .orderBy(desc(schema.resourceAggregates1h.bucketStart))
        .limit(300);

      history = agg1h.map((a) => ({
        cpuPercent: a.cpuPercentMean,
        memoryPercent: a.memoryPercentMean,
        diskPercent: a.diskPercentMean,
        pressureStatePeak: a.pressureStatePeak,
        observedAt: a.bucketStart.toISOString(),
      })).reverse();
    } else {
      // 1h, 6h, 24h
      const hours = range === "1h" ? 1 : range === "6h" ? 6 : 24;
      const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const snapshots = await db
        .select()
        .from(schema.resourceSnapshots)
        .where(and(eq(schema.resourceSnapshots.scope, "neo-avo-host"), gte(schema.resourceSnapshots.observedAt, cutoff)))
        .orderBy(desc(schema.resourceSnapshots.observedAt))
        .limit(300);

      history = snapshots.map((s) => ({
        cpuPercent: s.cpuPercent ?? 0,
        memoryPercent: s.memoryPercent ?? 0,
        diskPercent: s.diskPercent ?? 0,
        pressureStatePeak: (s.serviceState as { pressureState?: string })?.pressureState || "NORMAL",
        observedAt: s.observedAt.toISOString(),
      })).reverse();
    }

    return {
      host,
      monitoredServices: MONITORED_SERVICES,
      latestSnapshot: latestSnapshot ? {
        cpuPercent: latestSnapshot.cpuPercent,
        memoryPercent: latestSnapshot.memoryPercent,
        diskPercent: latestSnapshot.diskPercent,
        serviceState: latestSnapshot.serviceState,
        observedAt: latestSnapshot.observedAt,
      } : null,
      range,
      history,
    };
  });

  return NextResponse.json(result);
}

