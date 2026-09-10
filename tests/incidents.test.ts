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
});
