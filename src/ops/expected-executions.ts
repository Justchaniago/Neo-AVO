import { and, eq, gte, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { updateProject } from "../projects/repository";
import { findOpenIncidentByKey, resolveIncident } from "../incidents/repository";

type Db = NodePgDatabase<typeof schema>;
type QueryDb = Pick<Db, "select" | "insert" | "update">;

function zoneParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])) as Record<string, number>;
}

/** Converts a daily HH:mm local contract expectation to a UTC instant without a scheduler dependency. */
export function expectedAtForDay(now: Date, timezone: string, schedule: string) {
  const match = /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/.exec(schedule);
  if (!match) return null;
  const local = zoneParts(now, timezone);
  const target = Date.UTC(local.year, local.month - 1, local.day, Number(match[1]), Number(match[2]));
  let candidate = new Date(target);
  // Two passes handle the offset and DST boundaries for supported IANA zones.
  for (let index = 0; index < 2; index += 1) {
    const seen = zoneParts(candidate, timezone);
    candidate = new Date(candidate.getTime() + (target - Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)));
  }
  return candidate;
}

/** Maps an event to the schedule occurrence on its local calendar day. */
export function expectedAtForEvent(eventAt: Date, timezone: string, schedule: string) {
  const expectedAt = expectedAtForDay(eventAt, timezone, schedule);
  return expectedAt && expectedAt.getTime() <= eventAt.getTime() ? expectedAt : null;
}

/** Do not create missed occurrences for a schedule before it was last configured. */
export function contractEffectiveAt(contract: { createdAt: Date; updatedAt: Date }, expectedAt: Date) {
  return expectedAt.getTime() >= contract.updatedAt.getTime();
}

function matchesContractMetadata(data: unknown, metadata: unknown) {
  const match = metadata && typeof metadata === "object" && "match" in metadata && (metadata as { match?: unknown }).match && typeof (metadata as { match?: unknown }).match === "object" ? (metadata as { match: Record<string, unknown> }).match : null;
  if (!match) return true;
  if (!data || typeof data !== "object") return false;
  return Object.entries(match).every(([key, value]) => (data as Record<string, unknown>)[key] === value);
}

export async function evaluateExpectedExecutions(db: Db, now = new Date()) {
  const contracts = await db.select().from(schema.expectedExecutionContracts).where(eq(schema.expectedExecutionContracts.enabled, "true")).limit(200);
  let missed = 0;
  await db.transaction(async (tx) => {
    for (const contract of contracts) {
      const expectedAt = expectedAtForDay(now, contract.timezone, contract.schedule);
      if (!expectedAt || !contractEffectiveAt(contract, expectedAt) || now.getTime() <= expectedAt.getTime() + contract.gracePeriodSeconds * 1000) continue;
      const [existing] = await tx.select().from(schema.expectedExecutionOccurrences).where(and(eq(schema.expectedExecutionOccurrences.contractId, contract.id), eq(schema.expectedExecutionOccurrences.expectedAt, expectedAt))).limit(1);
      if (existing) continue;
      const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, contract.projectId)).limit(1);
      if (!project) continue;
      const recentSuccess = await tx.select({ id: schema.events.id, data: schema.events.data }).from(schema.events).where(and(eq(schema.events.projectId, project.id), eq(schema.events.type, contract.expectedEventType), gte(schema.events.occurredAt, expectedAt), lte(schema.events.occurredAt, now))).limit(20);
      if (recentSuccess.some((event) => matchesContractMetadata(event.data, contract.metadata))) continue;
      const [occurrence] = await tx.insert(schema.expectedExecutionOccurrences).values({ contractId: contract.id, expectedAt, missedAt: now }).onConflictDoNothing({ target: [schema.expectedExecutionOccurrences.contractId, schema.expectedExecutionOccurrences.expectedAt] }).returning();
      if (!occurrence) continue;
      const dedupKey = `expected:${contract.id}:${expectedAt.toISOString()}`;
      await tx.insert(schema.incidents).values({ projectId: project.id, environment: project.environment, type: "EXPECTED_EXECUTION_MISSED", dedupKey, severity: contract.severityOnMiss, state: "OPEN", reason: `${contract.name} missed its expected execution after the grace window`, firstSeenAt: now, lastSeenAt: now }).onConflictDoNothing();
      await updateProject(tx, project.id, { businessHealth: contract.severityOnMiss === "WARNING" ? "DEGRADED" : "FAILING" });
      missed += 1;
    }
  });
  return { evaluated: contracts.length, missed };
}

/** Completes previously missed contract occurrences when project-owned telemetry proves the effect. */
export async function recoverExpectedExecutionForEvent(db: QueryDb, event: typeof schema.events.$inferSelect) {
  const contracts = await db.select().from(schema.expectedExecutionContracts).where(and(eq(schema.expectedExecutionContracts.projectId, event.projectId), eq(schema.expectedExecutionContracts.expectedEventType, event.type), eq(schema.expectedExecutionContracts.enabled, "true"))).limit(20);
  let recovered = 0;
  for (const contract of contracts) {
    const expectedAt = expectedAtForEvent(event.occurredAt, contract.timezone, contract.schedule);
    if (!expectedAt || !matchesContractMetadata(event.data, contract.metadata)) continue;
    const [occurrence] = await db.select().from(schema.expectedExecutionOccurrences).where(and(
      eq(schema.expectedExecutionOccurrences.contractId, contract.id),
      eq(schema.expectedExecutionOccurrences.expectedAt, expectedAt),
      eq(schema.expectedExecutionOccurrences.status, "MISSED"),
    )).limit(1);
    if (!occurrence) continue;
    const [recoveredOccurrence] = await db.update(schema.expectedExecutionOccurrences)
      .set({ status: "RECOVERED", completedAt: event.occurredAt, sourceEventId: event.id })
      .where(and(eq(schema.expectedExecutionOccurrences.id, occurrence.id), eq(schema.expectedExecutionOccurrences.status, "MISSED")))
      .returning({ id: schema.expectedExecutionOccurrences.id });
    if (!recoveredOccurrence) continue;
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, event.projectId)).limit(1);
    if (project) {
      const dedupKey = `expected:${contract.id}:${occurrence.expectedAt.toISOString()}`;
      const incident = await findOpenIncidentByKey(db, project.id, project.environment, dedupKey);
      if (incident) await resolveIncident(db, incident.id, event.id, `Recovered by expected event ${event.type}`, event.occurredAt);
      if (!(project.slug === "qra-system" && event.type.startsWith("qra.reconcile."))) {
        await updateProject(db, project.id, { businessHealth: "HEALTHY" });
      }
    }
    recovered += 1;
  }
  return recovered;
}
