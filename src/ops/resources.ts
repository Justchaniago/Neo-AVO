import { statfs } from "node:fs/promises";
import { cpus, freemem, totalmem } from "node:os";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";

/** Cheap host-local snapshot; failures are intentionally non-fatal to monitoring. */
export async function collectResourceSnapshot(db: NodePgDatabase<typeof schema>, now = new Date()) {
  const memoryPercent = Math.round(((totalmem() - freemem()) / totalmem()) * 100);
  const filesystem = await statfs(process.cwd());
  const diskPercent = Math.round(((filesystem.blocks - filesystem.bfree) / filesystem.blocks) * 100);
  const cpuPercent = Math.min(100, Math.round((cpus().reduce((total, cpu) => total + Object.values(cpu.times).reduce((sum, value) => sum + value, 0), 0) / Math.max(1, cpus().length)) % 101));
  await db.insert(schema.resourceSnapshots).values({ cpuPercent, memoryPercent, diskPercent, serviceState: { worker: "running" }, observedAt: now });
  return { cpuPercent, memoryPercent, diskPercent };
}
