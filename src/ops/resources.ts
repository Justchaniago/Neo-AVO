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

/** 30s host snapshot collection & 24h retention cleanup */
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

  // Cleanup snapshots older than 24 hours to prevent unbounded table growth
  const retentionCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  try {
    await db.delete(schema.resourceSnapshots).where(lt(schema.resourceSnapshots.observedAt, retentionCutoff));
  } catch {
    // Non-fatal retention cleanup
  }

  return status;
}


