import { statfs } from "node:fs/promises";
import { loadavg, freemem, totalmem, cpus, hostname, arch } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import * as schema from "../db/schema";
import { log } from "../observability/logger";

const execAsync = promisify(exec);

export interface HostEntity {
  id: string;
  name: string;
  provider: string;
  environment: string;
  region: string;
  hostname: string;
  architecture: string;
  vcpuCount: number;
  memoryTotalBytes: number;
  diskTotalBytes: number;
  monitoringMode: "LOCAL_WORKER";
  enabled: boolean;
}

export interface MonitoredService {
  name: string;
  displayName: string;
  projectAssociation: string;
  criticality: "CRITICAL" | "NORMAL";
  status: "ACTIVE" | "INACTIVE" | "FAILED" | "UNKNOWN";
}

export const MONITORED_SERVICES: Array<Omit<MonitoredService, "status">> = [
  { name: "neo-avo-web", displayName: "Neo AVO Web", projectAssociation: "neo-avo", criticality: "CRITICAL" },
  { name: "neo-avo-worker", displayName: "Neo AVO Worker", projectAssociation: "neo-avo", criticality: "CRITICAL" },
  { name: "qra-commands", displayName: "QRA Worker", projectAssociation: "qra", criticality: "NORMAL" },
  { name: "briefing-agent", displayName: "Briefing Agent Worker", projectAssociation: "briefing-agent", criticality: "NORMAL" },
  { name: "postgresql", displayName: "PostgreSQL 16", projectAssociation: "platform", criticality: "CRITICAL" },
  { name: "nginx", displayName: "Nginx Reverse Proxy", projectAssociation: "platform", criticality: "CRITICAL" },
];

export function getHostEntity(): HostEntity {
  return {
    id: "shared-prod-01",
    name: "shared-prod-01",
    provider: "AWS Lightsail",
    environment: "production",
    region: "ap-southeast-1",
    hostname: hostname(),
    architecture: arch(),
    vcpuCount: Math.max(1, cpus().length),
    memoryTotalBytes: totalmem(),
    diskTotalBytes: 0,
    monitoringMode: "LOCAL_WORKER",
    enabled: true,
  };
}

export interface ProcessEvidence {
  pid: number;
  user: string;
  cpuPercent: number;
  memoryPercent: number;
  elapsed: string;
  command: string;
}

export async function captureProcessEvidence(): Promise<ProcessEvidence[]> {
  try {
    const { stdout } = await execAsync("ps -eo pid,user,%cpu,%mem,etime,args --sort=-%cpu | head -n 6");
    const lines = stdout.trim().split("\n").slice(1);
    return lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[0], 10) || 0;
      const user = parts[1] || "unknown";
      const cpuPercent = parseFloat(parts[2]) || 0;
      const memoryPercent = parseFloat(parts[3]) || 0;
      const elapsed = parts[4] || "00:00";
      const command = parts.slice(5).join(" ").slice(0, 150);
      return { pid, user, cpuPercent, memoryPercent, elapsed, command };
    });
  } catch {
    return [];
  }
}

export async function checkMonitoredServices(): Promise<MonitoredService[]> {
  return Promise.all(
    MONITORED_SERVICES.map(async (svc) => {
      try {
        const { stdout } = await execAsync(`systemctl is-active ${svc.name}.service 2>/dev/null || true`);
        const state = stdout.trim();
        const status = state === "active" ? "ACTIVE" : state === "failed" ? "FAILED" : state === "inactive" ? "INACTIVE" : "UNKNOWN";
        return { ...svc, status };
      } catch {
        return { ...svc, status: "UNKNOWN" as const };
      }
    })
  );
}

export interface SystemResourceStatus {
  hostId: string;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskPercent: number;
  load1: number;
  load5: number;
  load15: number;
  pressureState: "NORMAL" | "WARNING" | "CRITICAL";
  isSustained: boolean;
  services: MonitoredService[];
  topProcesses?: ProcessEvidence[];
}

export async function evaluateResourcePressure(db: NodePgDatabase<typeof schema>, windowMinutes = 5): Promise<SystemResourceStatus> {
  const host = getHostEntity();
  const cpusCount = host.vcpuCount;
  const [l1, l5, l15] = loadavg();
  const memoryUsedBytes = totalmem() - freemem();
  const memoryPercent = Math.round((memoryUsedBytes / totalmem()) * 100);
  const filesystem = await statfs(process.cwd());
  const diskPercent = Math.round(((filesystem.blocks - filesystem.bfree) / filesystem.blocks) * 100);

  const cpuPercent = Math.min(100, Math.round((l1 / cpusCount) * 100));

  let instantState: "NORMAL" | "WARNING" | "CRITICAL" = "NORMAL";
  if (l1 > cpusCount * 1.5 || memoryPercent > 90 || diskPercent > 95) {
    instantState = "CRITICAL";
  } else if (l1 > cpusCount * 0.8 || memoryPercent > 80 || diskPercent > 85) {
    instantState = "WARNING";
  }

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const recentSnapshots = await db
    .select()
    .from(schema.resourceSnapshots)
    .where(and(eq(schema.resourceSnapshots.scope, "neo-avo-host"), gte(schema.resourceSnapshots.observedAt, windowStart)))
    .orderBy(desc(schema.resourceSnapshots.observedAt))
    .limit(10);

  const highPressureCount = recentSnapshots.filter((s) => (s.cpuPercent ?? 0) >= 80 || (s.memoryPercent ?? 0) >= 80).length;
  const isSustained = instantState !== "NORMAL" && highPressureCount >= 2;
  const pressureState = instantState === "NORMAL" ? "NORMAL" : isSustained ? instantState : "WARNING";

  const services = await checkMonitoredServices();
  const topProcesses = instantState !== "NORMAL" ? await captureProcessEvidence() : undefined;

  return {
    hostId: host.id,
    cpuPercent,
    memoryPercent,
    memoryUsedBytes,
    memoryTotalBytes: totalmem(),
    diskPercent,
    load1: l1,
    load5: l5,
    load15: l15,
    pressureState,
    isSustained,
    services,
    topProcesses,
  };
}

/** Roll up raw 30s snapshots into 5m and 1h aggregates & clean expired data */
export async function processResourceAggregates(db: NodePgDatabase<typeof schema>, now = new Date()) {
  const hostId = "shared-prod-01";

  // 1. Roll up raw snapshots into 5m buckets (last 2 hours)
  const window5m = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const rawSnapshots = await db
    .select()
    .from(schema.resourceSnapshots)
    .where(and(eq(schema.resourceSnapshots.scope, "neo-avo-host"), gte(schema.resourceSnapshots.observedAt, window5m)));

  const buckets5m = new Map<number, typeof rawSnapshots>();
  for (const s of rawSnapshots) {
    const bucketTime = Math.floor(s.observedAt.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000);
    const existing = buckets5m.get(bucketTime) || [];
    existing.push(s);
    buckets5m.set(bucketTime, existing);
  }

  for (const [timeMs, samples] of buckets5m.entries()) {
    if (samples.length === 0) continue;
    const bucketStart = new Date(timeMs);
    const cpuVals = samples.map((s) => s.cpuPercent ?? 0);
    const memVals = samples.map((s) => s.memoryPercent ?? 0);
    const diskVals = samples.map((s) => s.diskPercent ?? 0);

    const cpuMean = Math.round(cpuVals.reduce((a, b) => a + b, 0) / samples.length);
    const cpuMax = Math.max(...cpuVals);
    const memMean = Math.round(memVals.reduce((a, b) => a + b, 0) / samples.length);
    const memMax = Math.max(...memVals);
    const diskMean = Math.round(diskVals.reduce((a, b) => a + b, 0) / samples.length);
    const diskMax = Math.max(...diskVals);
    const peakPressure = samples.some((s) => (s.serviceState as { pressureState?: string })?.pressureState === "CRITICAL")
      ? "CRITICAL"
      : samples.some((s) => (s.serviceState as { pressureState?: string })?.pressureState === "WARNING")
      ? "WARNING"
      : "NORMAL";

    await db
      .insert(schema.resourceAggregates5m)
      .values({
        hostId,
        bucketStart,
        sampleCount: samples.length,
        cpuPercentMean: cpuMean,
        cpuPercentMax: cpuMax,
        memoryPercentMean: memMean,
        memoryPercentMax: memMax,
        diskPercentMean: diskMean,
        diskPercentMax: diskMax,
        pressureStatePeak: peakPressure,
      })
      .onConflictDoNothing({ target: [schema.resourceAggregates5m.hostId, schema.resourceAggregates5m.bucketStart] });
  }

  // 2. Roll up 5m aggregates into 1h buckets (last 24 hours)
  const window1h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const agg5m = await db
    .select()
    .from(schema.resourceAggregates5m)
    .where(and(eq(schema.resourceAggregates5m.hostId, hostId), gte(schema.resourceAggregates5m.bucketStart, window1h)));

  const buckets1h = new Map<number, typeof agg5m>();
  for (const a of agg5m) {
    const bucketTime = Math.floor(a.bucketStart.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000);
    const existing = buckets1h.get(bucketTime) || [];
    existing.push(a);
    buckets1h.set(bucketTime, existing);
  }

  for (const [timeMs, samples] of buckets1h.entries()) {
    if (samples.length === 0) continue;
    const bucketStart = new Date(timeMs);
    const cpuVals = samples.map((s) => s.cpuPercentMean);
    const cpuMaxVals = samples.map((s) => s.cpuPercentMax);
    const memVals = samples.map((s) => s.memoryPercentMean);
    const memMaxVals = samples.map((s) => s.memoryPercentMax);
    const diskVals = samples.map((s) => s.diskPercentMean);
    const diskMaxVals = samples.map((s) => s.diskPercentMax);

    const totalSamples = samples.reduce((sum, s) => sum + s.sampleCount, 0);
    const cpuMean = Math.round(cpuVals.reduce((a, b) => a + b, 0) / samples.length);
    const cpuMax = Math.max(...cpuMaxVals);
    const memMean = Math.round(memVals.reduce((a, b) => a + b, 0) / samples.length);
    const memMax = Math.max(...memMaxVals);
    const diskMean = Math.round(diskVals.reduce((a, b) => a + b, 0) / samples.length);
    const diskMax = Math.max(...diskMaxVals);
    const peakPressure = samples.some((s) => s.pressureStatePeak === "CRITICAL")
      ? "CRITICAL"
      : samples.some((s) => s.pressureStatePeak === "WARNING")
      ? "WARNING"
      : "NORMAL";

    await db
      .insert(schema.resourceAggregates1h)
      .values({
        hostId,
        bucketStart,
        sampleCount: totalSamples,
        cpuPercentMean: cpuMean,
        cpuPercentMax: cpuMax,
        memoryPercentMean: memMean,
        memoryPercentMax: memMax,
        diskPercentMean: diskMean,
        diskPercentMax: diskMax,
        pressureStatePeak: peakPressure,
      })
      .onConflictDoNothing({ target: [schema.resourceAggregates1h.hostId, schema.resourceAggregates1h.bucketStart] });
  }

  // 3. Multi-tier Retention Cleanup
  const rawCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h
  const agg5mCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days
  const agg1hCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days

  try {
    await db.delete(schema.resourceSnapshots).where(lt(schema.resourceSnapshots.observedAt, rawCutoff));
    await db.delete(schema.resourceAggregates5m).where(lt(schema.resourceAggregates5m.bucketStart, agg5mCutoff));
    await db.delete(schema.resourceAggregates1h).where(lt(schema.resourceAggregates1h.bucketStart, agg1hCutoff));
  } catch (error) {
    log("error", "resources", "retention_cleanup_failed", { errorClass: error instanceof Error ? error.name : "unknown" });
  }
}

/** 30s host snapshot collection & retention/rollup execution */
export async function collectResourceSnapshot(db: NodePgDatabase<typeof schema>, now = new Date()) {
  const status = await evaluateResourcePressure(db);

  await db.insert(schema.resourceSnapshots).values({
    scope: "neo-avo-host",
    cpuPercent: status.cpuPercent,
    memoryPercent: status.memoryPercent,
    diskPercent: status.diskPercent,
    serviceState: {
      worker: "running",
      load1: status.load1,
      load5: status.load5,
      load15: status.load15,
      pressureState: status.pressureState,
      services: status.services,
      topProcesses: status.topProcesses,
    },
    observedAt: now,
  });

  if (status.isSustained && status.pressureState !== "NORMAL") {
    log("warn", "resources", "HOST_RESOURCE_PRESSURE", {
      cpuPercent: status.cpuPercent,
      memoryPercent: status.memoryPercent,
      diskPercent: status.diskPercent,
      load1: status.load1,
      pressureState: status.pressureState,
    });
  }

  // Execute incremental rollup and retention cleanup
  try {
    await processResourceAggregates(db, now);
  } catch (error) {
    log("error", "resources", "rollup_processing_failed", { errorClass: error instanceof Error ? error.name : "unknown" });
  }

  return status;
}



