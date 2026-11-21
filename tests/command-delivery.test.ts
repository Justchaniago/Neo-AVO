import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ claim: vi.fn(), mark: vi.fn(), project: vi.fn(), decrypt: vi.fn(), fetch: vi.fn() }));
vi.mock("../src/commands/repository", () => ({ claimPushCommand: mocks.claim, markPushAttempt: mocks.mark }));
vi.mock("../src/projects/repository", () => ({ findProjectById: mocks.project }));
vi.mock("../src/commands/secrets", () => ({ decryptCommandSecret: mocks.decrypt }));

import { deliverOnePushCommand } from "../src/commands/delivery";

const command = { id: "id", commandId: "cmd_1", projectId: "p", environment: "production", claimToken: "claim", requestedAt: new Date(), validUntil: new Date(Date.now() + 60_000), capability: "task.retry", arguments: { taskId: "t" } };

describe("safe PUSH delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEO_AVO_ALLOW_PRIVATE_COMMAND_ENDPOINTS", "false");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.claim.mockResolvedValue(command);
    mocks.project.mockResolvedValue({ commandEndpointUrl: "https://8.8.8.8/commands" });
    mocks.decrypt.mockReturnValue("outbound-secret");
    mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("does nothing when there is no command", async () => {
    mocks.claim.mockResolvedValue(null);
    expect(await deliverOnePushCommand({} as never)).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends an allowed command without following redirects", async () => {
    await deliverOnePushCommand({} as never);
    expect(mocks.fetch).toHaveBeenCalledWith("https://8.8.8.8/commands", expect.objectContaining({ redirect: "manual", method: "POST", headers: expect.objectContaining({ authorization: "Bearer outbound-secret" }) }));
    expect(mocks.mark).toHaveBeenCalledWith(expect.anything(), "id", "claim", true);
  });

  it.each(["https://127.0.0.1/commands", "https://[::ffff:169.254.169.254]/commands", "http://8.8.8.8/commands"])(
    "marks a refused endpoint FAILED without sending credentials: %s", async (commandEndpointUrl) => {
      mocks.project.mockResolvedValue({ commandEndpointUrl });
      await deliverOnePushCommand({} as never);
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.decrypt).not.toHaveBeenCalled();
      expect(mocks.mark).toHaveBeenCalledWith(expect.anything(), "id", "claim", false, expect.stringContaining("command_endpoint_refused"), true);
    },
  );

  it.each([301, 302, 303, 307, 308])("records HTTP %s as a delivery failure without following Location", async (status) => {
    mocks.fetch.mockResolvedValue(new Response(null, { status, headers: { location: "http://169.254.169.254/" } }));
    await deliverOnePushCommand({} as never);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.mark).toHaveBeenCalledWith(expect.anything(), "id", "claim", false, `external_project_http_${status}`, false);
  });

  it("preserves retry handling for network errors", async () => {
    mocks.fetch.mockRejectedValue(new Error("network unavailable"));
    await deliverOnePushCommand({} as never);
    expect(mocks.mark).toHaveBeenCalledWith(expect.anything(), "id", "claim", false, "network unavailable", false);
  });

  it("supports the explicit local mock override outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEO_AVO_ALLOW_PRIVATE_COMMAND_ENDPOINTS", "true");
    mocks.project.mockResolvedValue({ commandEndpointUrl: "http://127.0.0.1:8787/commands" });
    await deliverOnePushCommand({} as never);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.mark).toHaveBeenCalledWith(expect.anything(), "id", "claim", true);
  });
});
