import { statfs } from "node:fs/promises";
import { loadavg, freemem, totalmem, cpus } from "node:os";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte } from "drizzle-orm";
import * as schema from "../db/schema";
import { log } from "../observability/logger";

export interface SystemResourceStatus {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  load1: number;
  load5: number;
  load15: number;
  pressureState: "NORMAL" | "WARNING" | "CRITICAL";
  isSustained: boolean;
}

export async function evaluateResourcePressure(db: NodePgDatabase<typeof schema>, windowMinutes = 5): Promise<SystemResourceStatus> {
  const cpusCount = Math.max(1, cpus().length);
  const [l1, l5, l15] = loadavg();
  const memoryPercent = Math.round(((totalmem() - freemem()) / totalmem()) * 100);
  const filesystem = await statfs(process.cwd());
  const diskPercent = Math.round(((filesystem.blocks - filesystem.bfree) / filesystem.blocks) * 100);

  // Derive cpuPercent approximation from 1-min load average relative to vCPU count
  const cpuPercent = Math.min(100, Math.round((l1 / cpusCount) * 100));

  // Determine current instant pressure state based on host capacity
  let instantState: "NORMAL" | "WARNING" | "CRITICAL" = "NORMAL";
  if (l1 > cpusCount * 1.5 || memoryPercent > 90 || diskPercent > 95) {
    instantState = "CRITICAL";
  } else if (l1 > cpusCount * 0.8 || memoryPercent > 80 || diskPercent > 85) {
    instantState = "WARNING";
  }

  // Check historical snapshots for sustained pressure over sample window
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const recentSnapshots = await db
    .select()
    .from(schema.resourceSnapshots)
    .where(and(eq(schema.resourceSnapshots.scope, "neo-avo-host"), gte(schema.resourceSnapshots.observedAt, windowStart)))
    .orderBy(desc(schema.resourceSnapshots.observedAt))
    .limit(10);

  // Sustained pressure means multiple consecutive readings elevated above WARNING
  const highPressureCount = recentSnapshots.filter(s => (s.cpuPercent ?? 0) >= 80 || (s.memoryPercent ?? 0) >= 80).length;
  const isSustained = instantState !== "NORMAL" && highPressureCount >= 2;

  const pressureState = instantState === "NORMAL" ? "NORMAL" : (isSustained ? instantState : "WARNING");


  return {
    cpuPercent,
    memoryPercent,
    diskPercent,
    load1: l1,
    load5: l5,
    load15: l15,
    pressureState,
    isSustained,
  };
}

/** Cheap host-local snapshot; failures are intentionally non-fatal to monitoring. */
export async function collectResourceSnapshot(db: NodePgDatabase<typeof schema>, now = new Date()) {
  const status = await evaluateResourcePressure(db);
  
  await db.insert(schema.resourceSnapshots).values({
    scope: "neo-avo-host",
    cpuPercent: status.cpuPercent,
    memoryPercent: status.memoryPercent,
    diskPercent: status.diskPercent,
    serviceState: { worker: "running", load1: status.load1, pressureState: status.pressureState },
    observedAt: now,
  });

  // If sustained abnormal pressure is detected, trigger operational warning/incident event capability
  if (status.isSustained && status.pressureState !== "NORMAL") {
    log("warn", "resources", "HOST_RESOURCE_PRESSURE", {
      cpuPercent: status.cpuPercent,
      memoryPercent: status.memoryPercent,
      diskPercent: status.diskPercent,
      load1: status.load1,
      pressureState: status.pressureState,
    });
  }

  return status;
}

