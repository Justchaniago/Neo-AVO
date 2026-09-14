import { desc, lt } from "drizzle-orm";
import type { createConfiguredDb } from "../db/client";
import * as schema from "../db/schema";
import type { Capability, CapabilityResult, CloudProvider } from "./types";

type Db = ReturnType<typeof createConfiguredDb>["db"];

export async function persistCapability(db: Db, provider: CloudProvider, capability: Capability, result: CapabilityResult, observedAt: Date) {
  const success = result.status === "AVAILABLE";
  await db.insert(schema.cloudObserverState).values({
    provider, capability, status: result.status, lastAttemptAt: observedAt,
    lastSuccessAt: success ? observedAt : null, providerDataAsOf: result.providerDataAsOf ?? null,
    safeError: result.error?.slice(0, 300) ?? null, updatedAt: observedAt,
  }).onConflictDoUpdate({
    target: [schema.cloudObserverState.provider, schema.cloudObserverState.capability],
    set: { status: result.status, lastAttemptAt: observedAt, ...(success ? { lastSuccessAt: observedAt } : {}), providerDataAsOf: result.providerDataAsOf ?? null, safeError: result.error?.slice(0, 300) ?? null, updatedAt: observedAt },
  });

  if (capability === "infrastructure" && result.resources?.length) {
    await db.insert(schema.cloudResourceSnapshots).values(result.resources.map((value) => ({ ...value, metadata: value.metadata })));
  }
  // Explicit UNKNOWN/UNAVAILABLE payloads are retained; failures without a
  // payload leave the last valid snapshot intact.
  if (capability === "cost" && result.cost) await db.insert(schema.cloudCostSnapshots).values(result.cost);
  if (capability === "credits" && result.credits?.length) await db.insert(schema.cloudCreditSnapshots).values(result.credits);
}

export async function pruneCloudSnapshots(db: Db, cutoff: Date) {
  await Promise.all([
    db.delete(schema.cloudResourceSnapshots).where(lt(schema.cloudResourceSnapshots.observedAt, cutoff)),
    db.delete(schema.cloudCostSnapshots).where(lt(schema.cloudCostSnapshots.observedAt, cutoff)),
    db.delete(schema.cloudCreditSnapshots).where(lt(schema.cloudCreditSnapshots.observedAt, cutoff)),
  ]);
}

export async function readLatestCloudObserver(db: Db) {
  const [resources, costs, credits, state] = await Promise.all([
    db.select().from(schema.cloudResourceSnapshots).orderBy(desc(schema.cloudResourceSnapshots.observedAt)).limit(100),
    db.select().from(schema.cloudCostSnapshots).orderBy(desc(schema.cloudCostSnapshots.observedAt)).limit(20),
    db.select().from(schema.cloudCreditSnapshots).orderBy(desc(schema.cloudCreditSnapshots.observedAt)).limit(100),
    db.select().from(schema.cloudObserverState).orderBy(desc(schema.cloudObserverState.updatedAt)),
  ]);
  return { resources, costs, credits, state };
}

export function observerTablesOnly(tableName: string) {
  return ["cloud_resource_snapshots", "cloud_cost_snapshots", "cloud_credit_snapshots", "cloud_observer_state"].includes(tableName);
}
