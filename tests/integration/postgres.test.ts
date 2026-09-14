import { beforeAll, afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "../../src/db/client";
import { commands, events, incidentEvents, incidents, notifications, opsAnalyses, projectCredentials, projects, tasks } from "../../src/db/schema";
import { registerProject, rotateProjectCredential } from "../../src/projects/usecases";
import { persistEventBatch } from "../../src/events/usecases";
import { claimPendingEvent } from "../../src/worker/repository";
import { processClaimedEvent } from "../../src/worker/processor";
import { acknowledgeIncident, recordIncidentForEvent } from "../../src/incidents/usecases";
import { createIncident, resolveIncident } from "../../src/incidents/repository";
import { incidentTrigger } from "../../src/incidents/types";
import { and, eq, isNull, ne } from "drizzle-orm";
import { claimPullCommands } from "../../src/commands/repository";

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
    expect((await db.select().from(incidents).where(eq(incidents.type, "POISON_EVENT")))).toHaveLength(1);
  });

  it("deduplicates deterministic incidents, preserves evidence, and acknowledges", async () => {
    await db.update(events).set({ processedAt: new Date() }).where(isNull(events.processedAt));
    await persistEventBatch(db, [{ ...taskEvent("evt-incident"), type: "task.failed", data: { taskId: "incident-task", message: "provider timeout" } }], projectId);
    const claimed = await claimPendingEvent(db, "integration-incident");
    await processClaimedEvent(db, claimed!);
    await persistEventBatch(db, [{ ...taskEvent("evt-incident-2"), type: "task.failed", data: { taskId: "incident-task-2", message: "provider timeout" } }], projectId);
    const secondClaim = await claimPendingEvent(db, "integration-incident-2");
    await processClaimedEvent(db, secondClaim!);
    const source = (await db.select().from(events).where(eq(events.id, claimed!.id)))[0];
    const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
    await recordIncidentForEvent(db, project, { id: source.id, type: source.type, occurredAt: source.occurredAt, data: source.data });
    const rows = await db.select().from(incidents).where(eq(incidents.projectId, projectId));
    expect(rows.filter((row) => row.type === "TASK_FAILURE")).toHaveLength(1);
    expect(rows.find((row) => row.type === "TASK_FAILURE")?.occurrenceCount).toBe(2);
    expect(await db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, rows.find((row) => row.type === "TASK_FAILURE")!.id))).toHaveLength(2);
    expect(await db.select().from(notifications).where(eq(notifications.incidentId, rows.find((row) => row.type === "TASK_FAILURE")!.id))).toHaveLength(1);
    expect(await db.select().from(opsAnalyses).where(eq(opsAnalyses.incidentId, rows.find((row) => row.type === "TASK_FAILURE")!.id))).toHaveLength(1);
    const acknowledged = await acknowledgeIncident(db, rows.find((row) => row.type === "TASK_FAILURE")!.id);
    expect(acknowledged?.state).toBe("ACKNOWLEDGED");
  });

  it("persists bounded commands and isolates PULL delivery by project/environment", async () => {
    const other = await registerProject(db, { slug: "project-b", name: "Project B", environment: "production", runtimeMode: "on_demand", healthStrategy: "external", capabilities: [], criticality: "normal", staleAfterSeconds: 60, offlineAfterSeconds: 300 });
    await db.insert(commands).values({ commandId: "cmd-integration", projectId, environment: "production", capability: "task.retry", arguments: { taskId: "task-1" }, requestedAt: new Date(), validUntil: new Date(Date.now() + 60_000), deliveryMode: "PULL" });
    const own = await claimPullCommands(db, projectId, "production");
    const otherQueue = await claimPullCommands(db, other.project.id, "production");
    expect(own).toHaveLength(1);
    expect(own[0].commandId).toBe("cmd-integration");
    expect(otherQueue).toHaveLength(0);
    expect((await db.select().from(commands).where(eq(commands.commandId, "cmd-integration")))[0].status).toBe("SENT");
  });

  it("persists, projects, and incidents for a sanitized Tele Auto operational event", async () => {
    await db.update(events).set({ processedAt: new Date() }).where(isNull(events.processedAt));
    const input = { schemaVersion: 1 as const, eventId: "tele-auto-effect-uncertain", projectId: "project-a", environment: "production", type: "tele_auto.run.effect_uncertain", occurredAt: "2026-09-08T01:00:00.000Z", data: { runId: "run-1", store: "PMS", domain: "PRODUCTION", errorCode: "SHEETS_TIMEOUT", message: "must not persist" } };
    const validated = (await import("../../src/events/usecases")).validateEventBatch({ events: [input] }, { id: projectId, slug: "project-a", environment: "production" });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    await (await import("../../src/events/usecases")).persistEventBatch(db, validated.events, projectId);
    const claimed = await claimPendingEvent(db, "integration-tele-auto");
    await processClaimedEvent(db, claimed!);
    const stored = (await db.select().from(events).where(eq(events.eventId, input.eventId)))[0];
    expect(stored.data).toEqual({ runId: "run-1", store: "PMS", domain: "PRODUCTION", errorCode: "SHEETS_TIMEOUT" });
    expect(stored.processedAt).not.toBeNull();
    expect(await db.select().from(incidents).where(eq(incidents.type, "TELE_AUTO_EFFECT_UNCERTAIN"))).toHaveLength(1);
  });

  describe("incident deduplication and concurrency regression", () => {
    let regressionIncidentId: string;
    const dedupKey = () => `${projectId}:production:task-failure:task failure`;

    it("exact production regression: T0 + 1 day matching failure reuses OPEN incident without unique violation or quarantine", async () => {
      // Clear any previous unprocessed events
      await db.update(events).set({ processedAt: new Date() }).where(isNull(events.processedAt));

      // T0: Initial failure creates an OPEN TASK_FAILURE incident
      const t0 = new Date("2026-09-13T23:01:13.000Z");
      const t0Event = { ...taskEvent("reg-t0-evt"), type: "task.failed", occurredAt: t0.toISOString(), data: { taskId: "nightly:2026-09-13", message: "task failure" } };
      await persistEventBatch(db, [t0Event], projectId);
      const claimedT0 = await claimPendingEvent(db, "claim-t0");
      expect(claimedT0).not.toBeNull();
      const resT0 = await processClaimedEvent(db, claimedT0!);
      expect(resT0.status).toBe("processed");

      // Verify initial incident created
      const openIncidents = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), eq(incidents.state, "OPEN"), eq(incidents.dedupKey, dedupKey())));
      expect(openIncidents).toHaveLength(1);
      regressionIncidentId = openIncidents[0].id;
      expect(openIncidents[0].occurrenceCount).toBe(1);
      const initialFirstSeen = openIncidents[0].firstSeenAt.toISOString();

      // T0 + 1 day: Incident is still OPEN, last_seen_at is > 19 hours ago (well beyond 15 minutes)
      const t1 = new Date("2026-09-14T18:44:46.000Z");
      const t1Event = { ...taskEvent("reg-t1-evt"), type: "task.failed", occurredAt: t1.toISOString(), data: { taskId: "nightly:2026-09-14", message: "task failure" } };
      await persistEventBatch(db, [t1Event], projectId);
      const claimedT1 = await claimPendingEvent(db, "claim-t1");
      expect(claimedT1).not.toBeNull();

      // Before T1: record existing poison incidents count
      const poisonIncidentsBefore = await db.select().from(incidents).where(eq(incidents.type, "POISON_EVENT"));

      // In production before the hotfix, this failed with duplicate key violation on incidents_open_dedup_idx and quarantined after 3 attempts
      const resT1 = await processClaimedEvent(db, claimedT1!);
      expect(resT1.status).toBe("processed");

      // Verify the event was NOT quarantined and processed cleanly
      const storedT1 = (await db.select().from(events).where(eq(events.eventId, "reg-t1-evt")))[0];
      expect(storedT1.processedAt).not.toBeNull();
      expect(storedT1.quarantinedAt).toBeNull();
      expect(storedT1.processingAttempts).toBe(1);
      expect(storedT1.processingError).toBeNull();

      // Explicitly assert zero new POISON_EVENT incidents generated for this source flow
      const poisonIncidentsAfter = await db.select().from(incidents).where(eq(incidents.type, "POISON_EVENT"));
      expect(poisonIncidentsAfter).toHaveLength(poisonIncidentsBefore.length);
      const poisonForT1 = await db.select().from(incidents).where(and(eq(incidents.type, "POISON_EVENT"), eq(incidents.dedupKey, `${projectId}:production:poison:${storedT1.id}`)));
      expect(poisonForT1).toHaveLength(0);

      // Verify incident identity: exact same incident reused, occurrence_count incremented, last_seen_at updated, state remains OPEN
      const updatedIncident = (await db.select().from(incidents).where(eq(incidents.id, regressionIncidentId)))[0];
      expect(updatedIncident.id).toBe(regressionIncidentId);
      expect(updatedIncident.occurrenceCount).toBe(2);
      expect(updatedIncident.state).toBe("OPEN");
      expect(updatedIncident.firstSeenAt.toISOString()).toBe(initialFirstSeen);

      // Verify incident_events links both events
      const linkedEvents = await db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, regressionIncidentId));
      expect(linkedEvents).toHaveLength(2);
    });

    it("preserves ACKNOWLEDGED state and updates occurrence count when new same-key failure arrives", async () => {
      // Transition the incident to ACKNOWLEDGED
      await acknowledgeIncident(db, regressionIncidentId);
      const acked = (await db.select().from(incidents).where(eq(incidents.id, regressionIncidentId)))[0];
      expect(acked.state).toBe("ACKNOWLEDGED");
      const countBefore = acked.occurrenceCount;

      // New same-key failure arrives
      const ackEvent = { ...taskEvent("reg-ack-evt"), type: "task.failed", occurredAt: new Date().toISOString(), data: { taskId: "task-ack", message: "task failure" } };
      await persistEventBatch(db, [ackEvent], projectId);
      const claimed = await claimPendingEvent(db, "claim-ack");
      const res = await processClaimedEvent(db, claimed!);
      expect(res.status).toBe("processed");

      // Verify still ACKNOWLEDGED and occurrenceCount incremented by 1
      const afterNewEvent = (await db.select().from(incidents).where(eq(incidents.id, regressionIncidentId)))[0];
      expect(afterNewEvent.state).toBe("ACKNOWLEDGED");
      expect(afterNewEvent.occurrenceCount).toBe(countBefore + 1);
    });

    it("creates a brand-new incident when previous incident with same dedupKey is RESOLVED", async () => {
      // Resolve the existing active incident
      const ackEventRow = (await db.select().from(events).where(eq(events.eventId, "reg-ack-evt")))[0];
      await resolveIncident(db, regressionIncidentId, ackEventRow.id, "Issue fixed", new Date());
      const resolved = (await db.select().from(incidents).where(eq(incidents.id, regressionIncidentId)))[0];
      expect(resolved.state).toBe("RESOLVED");

      // New failure arrives with same dedupKey
      const newEvent = { ...taskEvent("reg-after-resolve"), type: "task.failed", occurredAt: new Date().toISOString(), data: { taskId: "task-after-resolve", message: "task failure" } };
      await persistEventBatch(db, [newEvent], projectId);
      const claimedNew = await claimPendingEvent(db, "claim-after-resolve");
      const res = await processClaimedEvent(db, claimedNew!);
      expect(res.status).toBe("processed");

      // Verify a brand new incident was created while old resolved incident remains intact
      const activeIncidents = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), eq(incidents.state, "OPEN"), eq(incidents.dedupKey, dedupKey())));
      expect(activeIncidents).toHaveLength(1);
      const newIncident = activeIncidents[0];
      expect(newIncident.id).not.toBe(regressionIncidentId);
      expect(newIncident.occurrenceCount).toBe(1);
      expect(newIncident.state).toBe("OPEN");

      const oldIncidentStillResolved = (await db.select().from(incidents).where(eq(incidents.id, regressionIncidentId)))[0];
      expect(oldIncidentStillResolved.state).toBe("RESOLVED");
    });

    it("idempotently handles replayed canonical event without duplicate links or incrementing occurrenceCount", async () => {
      const activeIncidents = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), eq(incidents.state, "OPEN"), eq(incidents.dedupKey, dedupKey())));
      const active = activeIncidents[0];
      const countBefore = active.occurrenceCount;

      const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
      const existingEvent = (await db.select().from(events).where(eq(events.eventId, "reg-after-resolve")))[0];

      // Re-record the exact same event
      await recordIncidentForEvent(db, project, { id: existingEvent.id, type: existingEvent.type, occurredAt: existingEvent.occurredAt, data: existingEvent.data });

      const activeAfter = (await db.select().from(incidents).where(eq(incidents.id, active.id)))[0];
      expect(activeAfter.occurrenceCount).toBe(countBefore);

      const links = await db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, active.id));
      expect(links).toHaveLength(1);
    });

    it("safely handles near-concurrent creation without duplicate active incidents or constraint violations", async () => {
      // Resolve any existing active incidents for clean test isolation
      await db.update(incidents).set({ state: "RESOLVED" }).where(and(eq(incidents.projectId, projectId), ne(incidents.state, "RESOLVED")));

      const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
      const evtA = { id: "00000000-0000-0000-0000-00000000001a", eventId: "concurrent-a", projectId, environment: "production", type: "task.failed", occurredAt: new Date(), data: { taskId: "conc-task-1", message: "concurrent crash" }, schemaVersion: 1 };
      const evtB = { id: "00000000-0000-0000-0000-00000000001b", eventId: "concurrent-b", projectId, environment: "production", type: "task.failed", occurredAt: new Date(), data: { taskId: "conc-task-2", message: "concurrent crash" }, schemaVersion: 1 };

      await db.insert(events).values([evtA, evtB]);

      // Execute recordIncidentForEvent concurrently via Promise.all
      const [incA, incB] = await Promise.all([
        recordIncidentForEvent(db, project, { id: evtA.id, type: evtA.type, occurredAt: evtA.occurredAt, data: evtA.data }),
        recordIncidentForEvent(db, project, { id: evtB.id, type: evtB.type, occurredAt: evtB.occurredAt, data: evtB.data }),
      ]);

      expect(incA).not.toBeNull();
      expect(incB).not.toBeNull();
      expect(incA!.id).toBe(incB!.id);

      const active = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), ne(incidents.state, "RESOLVED"), eq(incidents.dedupKey, `${projectId}:production:task-failure:concurrent crash`)));
      expect(active).toHaveLength(1);
      expect(active[0].occurrenceCount).toBe(2);
    });

    it("handles competing recordIncidentForEvent paths for the same event and creates exactly ONE initial notification", async () => {
      // Resolve any existing active incidents for clean test isolation
      await db.update(incidents).set({ state: "RESOLVED" }).where(and(eq(incidents.projectId, projectId), ne(incidents.state, "RESOLVED")));

      const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];
      const evtCompete = {
        id: "00000000-0000-0000-0000-00000000002b",
        eventId: "compete-canon-evt",
        projectId,
        environment: "production",
        type: "task.failed",
        occurredAt: new Date(),
        data: { taskId: "compete-task", message: "competing failure payload" },
        schemaVersion: 1,
      };
      await db.insert(events).values([evtCompete]);

      const trigger = incidentTrigger(project, evtCompete, new Date())!;
      expect(trigger).not.toBeNull();

      // Competing processing paths race concurrently via recordIncidentForEvent
      const [incA, incB] = await Promise.all([
        recordIncidentForEvent(db, project, { id: evtCompete.id, type: evtCompete.type, occurredAt: evtCompete.occurredAt, data: evtCompete.data }),
        recordIncidentForEvent(db, project, { id: evtCompete.id, type: evtCompete.type, occurredAt: evtCompete.occurredAt, data: evtCompete.data }),
      ]);

      expect(incA).not.toBeNull();
      expect(incB).not.toBeNull();
      // 1. Both competing paths converge safely to the same active incident
      expect(incA!.id).toBe(incB!.id);

      // 2. Exactly ONE active incident exists for the dedup key
      const activeIncidents = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), ne(incidents.state, "RESOLVED"), eq(incidents.dedupKey, trigger.dedupKey)));
      expect(activeIncidents).toHaveLength(1);
      expect(activeIncidents[0].occurrenceCount).toBe(1);

      // 3. Exactly ONE initial notification row exists with kind == 'initial'
      const incidentNotifs = await db.select().from(notifications).where(eq(notifications.incidentId, incA!.id));
      expect(incidentNotifs).toHaveLength(1);
      expect(incidentNotifs[0].kind).toBe("initial");

      // 4. Exactly ONE incident_events link exists
      const links = await db.select().from(incidentEvents).where(and(eq(incidentEvents.incidentId, incA!.id), eq(incidentEvents.eventId, evtCompete.id)));
      expect(links).toHaveLength(1);

      // 5. Replaying the same canonical event sequentially remains idempotent
      const incC = await recordIncidentForEvent(db, project, { id: evtCompete.id, type: evtCompete.type, occurredAt: evtCompete.occurredAt, data: evtCompete.data });
      expect(incC!.id).toBe(incA!.id);
      const notifsAfterReplay = await db.select().from(notifications).where(eq(notifications.incidentId, incA!.id));
      expect(notifsAfterReplay).toHaveLength(1);
      const linksAfterReplay = await db.select().from(incidentEvents).where(and(eq(incidentEvents.incidentId, incA!.id), eq(incidentEvents.eventId, evtCompete.id)));
      expect(linksAfterReplay).toHaveLength(1);
      const activeAfterReplay = (await db.select().from(incidents).where(eq(incidents.id, incA!.id)))[0];
      expect(activeAfterReplay.occurrenceCount).toBe(1);
    });

    it("active->RESOLVED race: retries bounded create loop and does not mutate or link resolved incident", async () => {
      // Resolve any existing active incidents for clean test isolation
      await db.update(incidents).set({ state: "RESOLVED" }).where(and(eq(incidents.projectId, projectId), ne(incidents.state, "RESOLVED")));

      const project = (await db.select().from(projects).where(eq(projects.id, projectId)))[0];

      // 1. Initial failure creates active incident inc1
      const evt1 = {
        id: "00000000-0000-0000-0000-00000000003a",
        eventId: "race-evt-1",
        projectId,
        environment: "production",
        type: "task.failed",
        occurredAt: new Date(),
        data: { taskId: "race-task", message: "race crash payload" },
        schemaVersion: 1,
      };
      await db.insert(events).values([evt1]);
      const inc1 = await recordIncidentForEvent(db, project, evt1);
      expect(inc1).not.toBeNull();
      expect(inc1!.state).toBe("OPEN");
      expect(inc1!.occurrenceCount).toBe(1);

      // 2. Second event arrives with same dedupKey
      const evt2 = {
        id: "00000000-0000-0000-0000-00000000003b",
        eventId: "race-evt-2",
        projectId,
        environment: "production",
        type: "task.failed",
        occurredAt: new Date(),
        data: { taskId: "race-task", message: "race crash payload" },
        schemaVersion: 1,
      };
      await db.insert(events).values([evt2]);

      const trigger = incidentTrigger(project, evt2, new Date())!;
      expect(trigger).not.toBeNull();

      // 3. Worker A reaches createIncident for evt2.
      // Intercept findDeduplicatedIncident in attempt 0 so that immediately after finding inc1,
      // a concurrent resolver sets inc1 to RESOLVED before updateIncident can mutate it.
      let raceInterceptionDone = false;
      const createAutoProxy = (targetObj: any): any => {
        return new Proxy(targetObj, {
          get(t, prop, receiver) {
            const val = Reflect.get(t, prop, receiver);
            if (prop === "limit" && typeof val === "function") {
              return async (...args: any[]) => {
                const rows = await val.apply(t, args);
                if (!raceInterceptionDone && Array.isArray(rows) && rows.length > 0 && rows[0].id === inc1!.id) {
                  raceInterceptionDone = true;
                  await db
                    .update(incidents)
                    .set({
                      state: "RESOLVED",
                      resolvedAt: new Date(),
                      resolutionReason: "Concurrent resolver won",
                    })
                    .where(eq(incidents.id, inc1!.id));
                }
                return rows;
              };
            }
            if (typeof val === "function") {
              return (...args: any[]) => {
                const result = val.apply(t, args);
                if (result && typeof result === "object") {
                  return createAutoProxy(result);
                }
                return result;
              };
            }
            return val;
          },
        });
      };
      const interceptDb = createAutoProxy(db);

      // Worker A executes createIncident:
      // - Attempt 0: insert conflicts with inc1
      // - Attempt 0: findDeduplicatedIncident returns inc1, but resolves inc1 right before return
      // - Attempt 0: updateIncident attempts atomic check on inc1, sees state='RESOLVED', returns null (does not link or increment!)
      // - Attempt 1: insert succeeds (inc1 is now RESOLVED), creates inc2, links evt2 to inc2!
      const inc2 = await createIncident(interceptDb as any, projectId, "production", trigger, evt2.id, new Date());
      expect(inc2).not.toBeNull();
      expect(inc2.id).not.toBe(inc1!.id);

      // Verify Assertions:
      // 1. Historical incident (inc1): state == RESOLVED, occurrence_count unchanged (1), does NOT receive evt2 link
      const historical = (await db.select().from(incidents).where(eq(incidents.id, inc1!.id)))[0];
      expect(historical.state).toBe("RESOLVED");
      expect(historical.occurrenceCount).toBe(1);
      const inc1Links = await db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, inc1!.id));
      expect(inc1Links).toHaveLength(1);
      expect(inc1Links[0].eventId).toBe(evt1.id);

      // 2. New incident (inc2): state == OPEN, contains the new event link, occurrence_count == 1
      expect(inc2.state).toBe("OPEN");
      expect(inc2.occurrenceCount).toBe(1);
      const inc2Links = await db.select().from(incidentEvents).where(eq(incidentEvents.incidentId, inc2.id));
      expect(inc2Links).toHaveLength(1);
      expect(inc2Links[0].eventId).toBe(evt2.id);

      // 3. Active incident count for dedupKey is exactly 1
      const activeIncidents = await db.select().from(incidents).where(and(eq(incidents.projectId, projectId), ne(incidents.state, "RESOLVED"), eq(incidents.dedupKey, trigger.dedupKey)));
      expect(activeIncidents).toHaveLength(1);
      expect(activeIncidents[0].id).toBe(inc2.id);
    });
  });
});
