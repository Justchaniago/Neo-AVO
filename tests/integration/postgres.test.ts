import { beforeAll, afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "../../src/db/client";
import { events, projectCredentials, projects, tasks } from "../../src/db/schema";
import { registerProject, rotateProjectCredential } from "../../src/projects/usecases";
import { persistEventBatch } from "../../src/events/usecases";
import { claimPendingEvent } from "../../src/worker/repository";
import { processClaimedEvent } from "../../src/worker/processor";
import { eq, isNull } from "drizzle-orm";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1" && Boolean(process.env.PG_INTEGRATION_DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const databaseUrl = process.env.PG_INTEGRATION_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/neo_avo";
const { db, pool } = createDb(databaseUrl, false);

const taskEvent = (eventId: string, data: Record<string, unknown> = { taskId: "task-1" }) => ({ schemaVersion: 1 as const, eventId, projectId: "project-a", environment: "production", type: "task.started", occurredAt: "2026-09-06T01:00:00.000Z", data });

suite("real PostgreSQL M3/M4 integration", () => {
  let projectId: string;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query("DROP SCHEMA public CASCADE");
    await admin.query("CREATE SCHEMA public");
    await admin.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await admin.query("CREATE SCHEMA drizzle");
    await admin.end();
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const registered = await registerProject(db, { slug: "project-a", name: "Project A", environment: "production", runtimeMode: "always_on", healthStrategy: "heartbeat", capabilities: [], criticality: "normal", staleAfterSeconds: 60, offlineAfterSeconds: 300 });
    projectId = registered.project.id;
  });

  afterAll(async () => { await pool.end(); });

  it("applies every migration and preserves credential uniqueness through rotation", async () => {
    const first = await db.select().from(projectCredentials).where(eq(projectCredentials.projectId, projectId));
    const oldToken = await rotateProjectCredential(db, projectId, "production");
    expect(oldToken).toMatch(/^neo_/);
    const second = await db.select().from(projectCredentials).where(eq(projectCredentials.projectId, projectId));
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second.filter((credential) => credential.revokedAt === null)).toHaveLength(1);
  });

  it("deduplicates event IDs and rolls back an invalid batch atomically", async () => {
    const first = await persistEventBatch(db, [taskEvent("evt-dedup")], projectId);
    const duplicate = await persistEventBatch(db, [taskEvent("evt-dedup")], projectId);
    expect(first).toHaveLength(1);
    expect(duplicate).toHaveLength(0);

    await expect(db.transaction(async (tx) => {
      await tx.insert(events).values([{ eventId: "evt-rollback-1", schemaVersion: 1, projectId, environment: "production", type: "task.started", occurredAt: new Date(), data: { taskId: "rollback" } }, { eventId: null as never, schemaVersion: 1, projectId, environment: "production", type: "task.started", occurredAt: new Date(), data: { taskId: "rollback" } }]);
    })).rejects.toThrow();
    expect(await db.select().from(events).where(eq(events.eventId, "evt-rollback-1"))).toHaveLength(0);
  });

  it("claims concurrently, recovers an expired lease, and atomically projects", async () => {
    await db.update(events).set({ processedAt: new Date() }).where(isNull(events.processedAt));
    await persistEventBatch(db, [taskEvent("evt-claim")], projectId);
    const claims = await Promise.all([claimPendingEvent(db, "integration-a"), claimPendingEvent(db, "integration-b")]);
    const claimed = claims.filter(Boolean);
    expect(claimed).toHaveLength(1);
    const firstClaim = claimed[0]!;
    await db.update(events).set({ claimExpiresAt: new Date(0) }).where(eq(events.id, firstClaim.id));
    const recovered = await claimPendingEvent(db, "integration-recovery");
    expect(recovered?.id).toBe(firstClaim.id);
    await processClaimedEvent(db, recovered!);
    expect((await db.select().from(events).where(eq(events.id, firstClaim.id)))[0].processedAt).not.toBeNull();
    expect((await db.select().from(tasks).where(eq(tasks.externalTaskId, "task-1")))).toHaveLength(1);
  });

  it("persists poison-event quarantine after the retry bound", async () => {
    await persistEventBatch(db, [taskEvent("evt-poison", {})], projectId);
    const claimed = await claimPendingEvent(db, "integration-poison");
    await db.update(events).set({ processingAttempts: 3 }).where(eq(events.id, claimed!.id));
    const refreshed = (await db.select().from(events).where(eq(events.id, claimed!.id)))[0];
    await processClaimedEvent(db, refreshed);
    const quarantined = (await db.select().from(events).where(eq(events.id, claimed!.id)))[0];
    expect(quarantined.quarantinedAt).not.toBeNull();
    expect(quarantined.processedAt).toBeNull();
    expect(quarantined.processingError).toContain("taskId");
  });
});
