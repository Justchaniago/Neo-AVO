import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ createAnalysisIfAbsent: vi.fn(), createIncident: vi.fn(), createNotification: vi.fn(), findDeduplicatedIncident: vi.fn(), findOpenIncidentByKey: vi.fn(), resolveIncident: vi.fn(), updateIncident: vi.fn() }));
vi.mock("../src/incidents/repository", () => repo);
vi.mock("../src/ops/repository", () => ({ createAnalysisIfAbsent: repo.createAnalysisIfAbsent }));

import { recordIncidentForEvent, resolveIncidentForEvent, manuallyResolveIncident } from "../src/incidents/usecases";
import { incidentTrigger, recoveryKey, shouldNotifyImmediately } from "../src/incidents/types";

const project = { id: "project-a", environment: "production", criticality: "normal", expectedNextExecutionAt: null, gracePeriodSeconds: null, lastSuccessfulExecutionAt: null };
const now = new Date("2026-09-06T12:00:00Z");

describe("deterministic incident engine", () => {
  beforeEach(() => { vi.clearAllMocks(); repo.createIncident.mockResolvedValue({ id: "incident-1", severity: "HIGH", type: "TASK_FAILURE", reason: "timeout", environment: "production" }); repo.updateIncident.mockResolvedValue({ id: "incident-1", severity: "HIGH", type: "TASK_FAILURE", reason: "timeout", environment: "production" }); repo.resolveIncident.mockResolvedValue({ id: "incident-1", state: "RESOLVED" }); });

  it("creates deterministic incidents and maps notification severity", () => {
    const trigger = incidentTrigger(project, { id: "event-1", type: "task.failed", occurredAt: now, data: { taskId: "task-1", message: "timeout" } }, now);
    expect(trigger).toMatchObject({ type: "TASK_FAILURE", severity: "HIGH", errorSignature: "timeout" });
    expect(shouldNotifyImmediately("HIGH")).toBe(true);
    expect(shouldNotifyImmediately("CRITICAL")).toBe(true);
    expect(shouldNotifyImmediately("INFO")).toBe(false);
    expect(shouldNotifyImmediately("WARNING")).toBe(false);
  });

  it("deduplicates equivalent failures and does not create another notification", async () => {
    repo.findDeduplicatedIncident.mockResolvedValue({ id: "incident-1", severity: "HIGH", type: "TASK_FAILURE", reason: "timeout", environment: "production" });
    await recordIncidentForEvent({} as never, project, { id: "event-2", type: "task.failed", occurredAt: now, data: { taskId: "task-2", message: "timeout" } }, now);
    expect(repo.updateIncident).toHaveBeenCalledOnce();
    expect(repo.createIncident).not.toHaveBeenCalled();
    expect(repo.createNotification).not.toHaveBeenCalled();
  });

  it("keeps unrelated signatures separate and creates one immediate notification", async () => {
    repo.findDeduplicatedIncident.mockResolvedValue(null);
    await recordIncidentForEvent({} as never, project, { id: "event-3", type: "task.failed", occurredAt: now, data: { taskId: "task-1", message: "quota exceeded" } }, now);
    expect(repo.createIncident).toHaveBeenCalledOnce();
    expect(repo.createNotification).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "initial", severity: "HIGH" }));
  });

  it("resolves dependency and offline incidents only on matching deterministic evidence", async () => {
    repo.findOpenIncidentByKey.mockResolvedValue({ id: "incident-1" });
    await resolveIncidentForEvent({} as never, project, { id: "event-4", type: "dependency.recovered", occurredAt: now, data: { dependency: "payments" } }, "Dependency recovered", now);
    expect(repo.resolveIncident).toHaveBeenCalledOnce();
    expect(recoveryKey(project, { id: "event-5", type: "project.started", occurredAt: now, data: {} })).toBe("project-a:production:project-offline");
  });

  it("maps high-value Tele Auto facts without treating clarification as an incident", () => {
    expect(incidentTrigger(project, { id: "event-6", type: "tele_auto.run.needs_clarification", occurredAt: now, data: { runId: "run-1" } }, now)).toBeNull();
    expect(incidentTrigger(project, { id: "event-7", type: "tele_auto.run.effect_uncertain", occurredAt: now, data: { runId: "run-1", errorCode: "SHEETS_TIMEOUT" } }, now)).toMatchObject({ type: "TELE_AUTO_EFFECT_UNCERTAIN", severity: "CRITICAL", dedupKey: "project-a:production:tele-auto:effect-uncertain:run-1" });
    expect(incidentTrigger(project, { id: "event-8", type: "tele_auto.sheets.schema_mismatch", occurredAt: now, data: { errorCode: "HEADER_MISSING" } }, now)).toMatchObject({ type: "TELE_AUTO_SHEETS_SCHEMA_MISMATCH", severity: "HIGH" });
  });

  it("supports manual owner resolution with audit event and without fabricating recovery evidence", async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "incident-legacy-1", projectId: "p1", environment: "production", state: "OPEN" }]),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: "incident-legacy-1", state: "RESOLVED", resolutionReason: "Manual owner resolution: Checked manually" }]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    };

    const res = await manuallyResolveIncident(mockDb as never, "incident-legacy-1", { resolutionNote: "Checked manually" }, now);
    expect(res).toMatchObject({ state: "RESOLVED" });
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("Test A: OPEN failure, no recovery evidence -> incident RESOLVED, project AWAITING_VERIFICATION", async () => {
    let updateProjectsSet: Record<string, unknown> = {};
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation((condition) => {
        return {
          limit: vi.fn().mockImplementation(() => {
            // First call: existing incident
            // Second call: project
            return Promise.resolve([
              {
                id: "p1",
                operationalHealth: "FAILING",
                businessHealth: "FAILING",
                lastFailureAt: new Date("2026-09-06T10:00:00Z"),
                lastSuccessfulExecutionAt: null,
              },
            ]);
          }),
        };
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockImplementation((val) => {
        updateProjectsSet = val;
        return {
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: "inc-1", state: "RESOLVED" }]),
        };
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    };

    // Custom select implementation for full flow
    let selectCount = 0;
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          selectCount++;
          if (selectCount === 1) {
            // existing incident
            return { limit: vi.fn().mockResolvedValue([{ id: "inc-1", projectId: "p1", environment: "production", state: "OPEN" }]) };
          }
          if (selectCount === 2) {
            // remainingOpen incidents -> 0 remaining
            return Promise.resolve([]);
          }
          if (selectCount === 3) {
            // project
            return {
              limit: vi.fn().mockResolvedValue([{
                id: "p1",
                operationalHealth: "FAILING",
                businessHealth: "FAILING",
                lastFailureAt: new Date("2026-09-06T10:00:00Z"),
                lastSuccessfulExecutionAt: null,
              }]),
            };
          }
          return { limit: vi.fn().mockResolvedValue([]) };
        }),
      }),
    });

    const res = await manuallyResolveIncident(mockDb as never, "inc-1", {}, now);
    expect(res).toMatchObject({ state: "RESOLVED" });
    expect(updateProjectsSet.operationalHealth).toBe("AWAITING_VERIFICATION");
    expect(updateProjectsSet.businessHealth).toBe("AWAITING_VERIFICATION");
  });

  it("Test B: OPEN failure, newer authoritative success already exists -> project HEALTHY", async () => {
    let updateProjectsSet: Record<string, unknown> = {};
    let selectCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCount++;
            if (selectCount === 1) {
              return { limit: vi.fn().mockResolvedValue([{ id: "inc-2", projectId: "p1", environment: "production", state: "OPEN" }]) };
            }
            if (selectCount === 2) {
              return Promise.resolve([]);
            }
            if (selectCount === 3) {
              return {
                limit: vi.fn().mockResolvedValue([{
                  id: "p1",
                  operationalHealth: "FAILING",
                  businessHealth: "FAILING",
                  lastFailureAt: new Date("2026-09-06T10:00:00Z"),
                  lastSuccessfulExecutionAt: new Date("2026-09-06T11:00:00Z"), // newer than failure
                }]),
              };
            }
            return { limit: vi.fn().mockResolvedValue([]) };
          }),
        }),
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockImplementation((val) => {
        updateProjectsSet = val;
        return {
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: "inc-2", state: "RESOLVED" }]),
        };
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    };

    const res = await manuallyResolveIncident(mockDb as never, "inc-2", {}, now);
    expect(res).toMatchObject({ state: "RESOLVED" });
    expect(updateProjectsSet.operationalHealth).toBe("HEALTHY");
    expect(updateProjectsSet.businessHealth).toBe("HEALTHY");
  });

  it("Test C: multiple OPEN failures, resolve one -> remaining keeps project health unchanged", async () => {
    let projectUpdated = false;
    let selectCount = 0;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCount++;
            if (selectCount === 1) {
              return { limit: vi.fn().mockResolvedValue([{ id: "inc-1", projectId: "p1", environment: "production", state: "OPEN" }]) };
            }
            if (selectCount === 2) {
              // another incident is still open!
              return Promise.resolve([{ id: "inc-other", state: "OPEN" }]);
            }
            return { limit: vi.fn().mockResolvedValue([]) };
          }),
        }),
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockImplementation((val) => {
        if ("operationalHealth" in val || "businessHealth" in val) {
          projectUpdated = true;
        }
        return {
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: "inc-1", state: "RESOLVED" }]),
        };
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    };

    const res = await manuallyResolveIncident(mockDb as never, "inc-1", {}, now);
    expect(res).toMatchObject({ state: "RESOLVED" });
    expect(projectUpdated).toBe(false);
  });

  it("Test D & E: manual resolution with and without note", async () => {
    let capturedReasonWithNote = "";
    let selectCount = 0;
    const mockDbWithNote = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCount++;
            if (selectCount === 1) return { limit: vi.fn().mockResolvedValue([{ id: "inc-1", projectId: "p1", state: "OPEN" }]) };
            return Promise.resolve([{ id: "inc-other", state: "OPEN" }]);
          }),
        }),
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockImplementation((val) => {
        capturedReasonWithNote = val.resolutionReason;
        return {
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: "inc-1", state: "RESOLVED", resolutionReason: val.resolutionReason }]),
        };
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    };

    const resWithNote = await manuallyResolveIncident(mockDbWithNote as never, "inc-1", { resolutionNote: "Fix applied" }, now);
    expect(resWithNote?.resolutionReason).toBe("Manual owner resolution: Fix applied");

    let capturedReasonWithoutNote = "";
    selectCount = 0;
    const mockDbWithoutNote = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCount++;
            if (selectCount === 1) return { limit: vi.fn().mockResolvedValue([{ id: "inc-1", projectId: "p1", state: "OPEN" }]) };
            return Promise.resolve([{ id: "inc-other", state: "OPEN" }]);
          }),
        }),
      }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockImplementation((val) => {
        capturedReasonWithoutNote = val.resolutionReason;
        return {
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: "inc-1", state: "RESOLVED", resolutionReason: val.resolutionReason }]),
        };
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue([]),
    };

    const resWithoutNote = await manuallyResolveIncident(mockDbWithoutNote as never, "inc-1", {}, now);
    expect(resWithoutNote?.resolutionReason).toBe("Manual owner resolution");
  });

  it("Test F: already resolved incident -> returns null deterministically", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // where state <> 'RESOLVED' matches 0 rows
          }),
        }),
      }),
    };

    const res = await manuallyResolveIncident(mockDb as never, "already-resolved", {}, now);
    expect(res).toBeNull();
  });
});
