import { NextResponse } from "next/server";
import { withConfiguredDb } from "../../../../src/db/client";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";

import * as schema from "../../../../src/db/schema";
import { getHostEntity, MONITORED_SERVICES } from "../../../../src/ops/resources";
import { pressureEpisodes, type PressurePoint } from "../../../../src/ops/infrastructure-view";

const EPISODE_POINT_LIMIT = 5000;

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
    // Episodes read only the pressured rows of the whole range, so they are not cut off by the chart's 300-point cap.
    let pressured: PressurePoint[] = [];
    let intervalMs = 30_000;
    if (range === "7d") {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const agg5m = await db
        .select()
        .from(schema.resourceAggregates5m)
        .where(and(eq(schema.resourceAggregates5m.hostId, host.id), gte(schema.resourceAggregates5m.bucketStart, cutoff)))
        .orderBy(desc(schema.resourceAggregates5m.bucketStart))
        .limit(300);

      intervalMs = 5 * 60_000;
      const rows = await db
        .select()
        .from(schema.resourceAggregates5m)
        .where(and(eq(schema.resourceAggregates5m.hostId, host.id), gte(schema.resourceAggregates5m.bucketStart, cutoff), ne(schema.resourceAggregates5m.pressureStatePeak, "NORMAL")))
        .orderBy(desc(schema.resourceAggregates5m.bucketStart))
        .limit(EPISODE_POINT_LIMIT);
      pressured = rows.map((a) => ({ observedAt: a.bucketStart.toISOString(), pressureState: a.pressureStatePeak, cpuPercent: a.cpuPercentMax, memoryPercent: a.memoryPercentMax }));

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

      intervalMs = 60 * 60_000;
      const rows = await db
        .select()
        .from(schema.resourceAggregates1h)
        .where(and(eq(schema.resourceAggregates1h.hostId, host.id), gte(schema.resourceAggregates1h.bucketStart, cutoff), ne(schema.resourceAggregates1h.pressureStatePeak, "NORMAL")))
        .orderBy(desc(schema.resourceAggregates1h.bucketStart))
        .limit(EPISODE_POINT_LIMIT);
      pressured = rows.map((a) => ({ observedAt: a.bucketStart.toISOString(), pressureState: a.pressureStatePeak, cpuPercent: a.cpuPercentMax, memoryPercent: a.memoryPercentMax }));

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

      const pressureState = sql<string>`${schema.resourceSnapshots.serviceState}->>'pressureState'`;
      const rows = await db
        .select({ observedAt: schema.resourceSnapshots.observedAt, cpuPercent: schema.resourceSnapshots.cpuPercent, memoryPercent: schema.resourceSnapshots.memoryPercent, pressureState })
        .from(schema.resourceSnapshots)
        .where(and(eq(schema.resourceSnapshots.scope, "neo-avo-host"), gte(schema.resourceSnapshots.observedAt, cutoff), sql`${pressureState} in ('WARNING', 'CRITICAL')`))
        .orderBy(desc(schema.resourceSnapshots.observedAt))
        .limit(EPISODE_POINT_LIMIT);
      pressured = rows.map((s) => ({ observedAt: s.observedAt.toISOString(), pressureState: s.pressureState, cpuPercent: s.cpuPercent ?? 0, memoryPercent: s.memoryPercent ?? 0 }));

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
      episodes: pressureEpisodes(pressured, {
        intervalMs,
        bucketed: intervalMs > 30_000,
        currentlyPressured: ["WARNING", "CRITICAL"].includes((latestSnapshot?.serviceState as { pressureState?: string } | undefined)?.pressureState ?? ""),
        now: now.getTime(),
      }),
    };
  });

  return NextResponse.json(result);
}

