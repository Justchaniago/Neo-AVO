import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ createIncident: vi.fn(), createNotification: vi.fn(), findDeduplicatedIncident: vi.fn(), findOpenIncidentByKey: vi.fn(), resolveIncident: vi.fn(), updateIncident: vi.fn() }));
vi.mock("../src/incidents/repository", () => repo);

import { recordIncidentForEvent, resolveIncidentForEvent } from "../src/incidents/usecases";
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
});
