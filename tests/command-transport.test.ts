import { createServer, type Server, type RequestListener } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import { assertSafeCommandEndpoint, CommandEndpointRefused } from "../src/commands/endpoint";
import { postCommand } from "../src/commands/transport";

describe("command socket transport", () => {
  let server: Server | undefined;
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    mocks.lookup.mockReset();
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  async function listen(handler: RequestListener) {
    server = createServer(handler);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing_test_port");
    return `http://rebind.test:${address.port}/commands`;
  }

  it("rejects a private connect-time answer even after an earlier public check passed", async () => {
    const received = vi.fn((_request, response) => response.end());
    const endpoint = await listen(received);
    mocks.lookup.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]);
    await assertSafeCommandEndpoint(endpoint);
    mocks.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(postCommand(endpoint, "{}", "outbound-secret")).rejects.toBeInstanceOf(CommandEndpointRefused);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(received).not.toHaveBeenCalled();
  });

  it("rejects mixed DNS answers before opening a connection", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "::1", family: 6 }]);
    await expect(postCommand("http://mixed.test/commands", "{}", null)).rejects.toThrow("private_or_reserved_address");
  });

  it.each(["http://127.0.0.1/commands", "http://[::ffff:7f00:1]/commands"])("blocks literal addresses that bypass socket lookup: %s", async (endpoint) => {
    await expect(postCommand(endpoint, "{}", null)).rejects.toBeInstanceOf(CommandEndpointRefused);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("uses only the lookup answer handed to the socket and discards the response body", async () => {
    let payload = "";
    const endpoint = await listen((request, response) => {
      expect(request.method).toBe("POST");
      expect(request.headers.authorization).toBe("Bearer outbound-secret");
      expect(request.headers.host).toContain("rebind.test:");
      request.on("data", (data) => { payload += data; });
      request.on("end", () => { response.writeHead(200); response.write("body that never ends"); });
    });
    mocks.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]).mockRejectedValue(new Error("unexpected_second_lookup"));
    await expect(postCommand(endpoint, '{"message":"é"}', "outbound-secret", true)).resolves.toBeUndefined();
    expect(payload).toBe('{"message":"é"}');
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });

  it.each([301, 302, 303, 307, 308])("does not follow HTTP %s redirects", async (status) => {
    let received = 0;
    const endpoint = await listen((_request, response) => {
      received++;
      response.writeHead(status, { location: "/private-target" }).end();
    });
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(postCommand(endpoint, "{}", null, true)).rejects.toThrow(`external_project_http_${status}`);
    expect(received).toBe(1);
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });

  it("bounds a stalled DNS lookup by the overall ten-second deadline", async () => {
    mocks.lookup.mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = postCommand("http://stalled.test/commands", "{}", null);
    const rejected = expect(pending).rejects.toThrow("command_delivery_timeout");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });

  it("keeps the same deadline after DNS completes but the response stalls", async () => {
    let received!: () => void;
    const arrived = new Promise<void>((resolve) => { received = resolve; });
    const endpoint = await listen(() => received());
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = postCommand(endpoint, "{}", null, true);
    const rejected = expect(pending).rejects.toThrow("command_delivery_timeout");
    await arrived;
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
  });
});
