import { describe, expect, it, vi } from "vitest";
import { canTransition, validateCapability } from "../src/commands/types";
import { requestCommand, acknowledgeCommand, recordCommandResult } from "../src/commands/usecases";

const mocks = vi.hoisted(() => ({ project: vi.fn(), insert: vi.fn(), find: vi.fn(), transition: vi.fn() }));
vi.mock("../src/projects/repository", () => ({ findProjectById: mocks.project }));
vi.mock("../src/commands/repository", () => ({ insertCommand: mocks.insert, findCommand: mocks.find, transitionCommand: mocks.transition }));

describe("bounded commands", () => {
  it("requires a declared, explicitly supported capability", () => {
    expect(validateCapability("task.retry", { taskId: "t" }, ["task.retry"]).ok).toBe(true);
    expect(validateCapability("shell.exec", {}, ["shell.exec"]).ok).toBe(false);
    expect(validateCapability("task.retry", { taskId: "t", command: "rm" }, ["task.retry"]).ok).toBe(false);
  });
  it("creates only an unexpired project-scoped command", async () => {
    mocks.project.mockResolvedValue({ id: "p", environment: "prod", capabilities: ["task.retry"], commandDeliveryMode: "PULL" });
    mocks.insert.mockResolvedValue({ commandId: "cmd_1" });
    await expect(requestCommand({} as never, { projectId: "p", environment: "prod", capability: "task.retry", arguments: { taskId: "t" }, validUntil: new Date(Date.now() + 60_000) })).resolves.toEqual({ commandId: "cmd_1" });
    await expect(requestCommand({} as never, { projectId: "p", environment: "prod", capability: "task.retry", arguments: { taskId: "t" }, validUntil: new Date(Date.now() - 1) })).rejects.toThrow("command_expired");
  });
  it("does not permit cross-project or lifecycle regression", async () => {
    mocks.find.mockResolvedValue({ commandId: "cmd_1", projectId: "p", environment: "prod", status: "COMPLETED", validUntil: new Date(Date.now() + 1_000) });
    await expect(acknowledgeCommand({} as never, "cmd_1", "other", "prod")).rejects.toThrow("command_not_found");
    await expect(acknowledgeCommand({} as never, "cmd_1", "p", "prod")).rejects.toThrow("invalid_command_transition");
    expect(canTransition("COMPLETED", "ACKNOWLEDGED")).toBe(false);
  });
  it("accepts a legal result and keeps unsupported actions advisory", async () => {
    mocks.find.mockResolvedValue({ commandId: "cmd_1", projectId: "p", environment: "prod", status: "ACKNOWLEDGED", validUntil: new Date(Date.now() + 1_000) });
    mocks.transition.mockResolvedValue({ status: "COMPLETED" });
    await expect(recordCommandResult({} as never, "cmd_1", "p", "prod", { status: "COMPLETED", result: { alreadyProcessed: true } })).resolves.toEqual({ status: "COMPLETED" });
    expect(mocks.insert).not.toHaveBeenCalledWith(expect.objectContaining({ capability: "deployment.restart" }));
  });
});
