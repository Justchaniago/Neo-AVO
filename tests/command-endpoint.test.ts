import { afterEach, describe, expect, it, vi } from "vitest";

import { assertSafeCommandEndpoint, isBlockedCommandAddress } from "../src/commands/endpoint";
import { projectConfigSchema, projectUpdateSchema } from "../src/projects/types";
import { registerProject, updateProjectConfig } from "../src/projects/usecases";

const project = { slug: "test", name: "Test", environment: "production", runtimeMode: "always_on", healthStrategy: "heartbeat" };

describe("command endpoint validation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires HTTPS in production for creation and updates", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const commandEndpointUrl of ["http://example.com/commands", "ftp://example.com", "https://user:password@example.com", "not a url", ""]) {
      expect(projectConfigSchema.safeParse({ ...project, commandEndpointUrl }).success).toBe(false);
      expect(projectUpdateSchema.safeParse({ commandEndpointUrl }).success).toBe(false);
    }
    expect(projectConfigSchema.safeParse({ ...project, commandEndpointUrl: "https://example.com/commands" }).success).toBe(true);
    expect(projectUpdateSchema.safeParse({}).success).toBe(true);
    expect(projectConfigSchema.safeParse(project).success).toBe(true);
    await expect(registerProject({} as never, { ...project, runtimeMode: "always_on", healthStrategy: "heartbeat", capabilities: [], criticality: "normal", staleAfterSeconds: 300, offlineAfterSeconds: 900, commandEndpointUrl: "http://example.com" })).rejects.toThrow("invalid_command_endpoint");
    await expect(updateProjectConfig({} as never, "p", { commandEndpointUrl: "http://example.com" })).rejects.toThrow("invalid_command_endpoint");
  });

  it("allows HTTP only outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(projectUpdateSchema.safeParse({ commandEndpointUrl: "http://localhost:8787/commands" }).success).toBe(true);
    expect(projectUpdateSchema.safeParse({ commandEndpointUrl: "ftp://example.com" }).success).toBe(false);
  });

  it.each([
    "0.0.0.0", "0.1.2.3", "127.0.0.1", "127.255.1.2", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "100.127.255.255", "224.0.0.1", "255.255.255.255",
    "::", "::1", "fc00::1", "fdff::1", "fe80::1", "febf::1", "ff02::1", "::127.0.0.1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:100.64.0.1",
    "::ffff:7f00:1", "0:0:0:0:0:ffff:c0a8:101", "fe80::1%eth0", "invalid",
  ])("blocks %s", (address) => expect(isBlockedCommandAddress(address)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "2001:4860:4860::8888", "::ffff:8.8.8.8"])(
    "allows public address %s", (address) => expect(isBlockedCommandAddress(address)).toBe(false),
  );

  it("checks every DNS answer and rejects mixed public/private results", async () => {
    const resolve = vi.fn().mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "::1", family: 6 }]);
    await expect(assertSafeCommandEndpoint("https://example.com", false, resolve)).rejects.toThrow("command_endpoint_refused");
    expect(resolve).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
    resolve.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    await expect(assertSafeCommandEndpoint("https://example.com", false, resolve)).resolves.toBeUndefined();
    resolve.mockResolvedValue([]);
    await expect(assertSafeCommandEndpoint("https://example.com", false, resolve)).rejects.toThrow("private_or_reserved_address");
    resolve.mockRejectedValue(new Error("DNS unavailable"));
    await expect(assertSafeCommandEndpoint("https://example.com", false, resolve)).rejects.toThrow("DNS unavailable");
  });

  it("checks literal, normalized, and mapped IPs without DNS", async () => {
    for (const host of ["127.1", "2130706433", "0x7f000001", "[::1]", "[::ffff:7f00:1]"]) {
      await expect(assertSafeCommandEndpoint(`https://${host}`)).rejects.toThrow("private_or_reserved_address");
    }
  });

  it("allows the explicit private-network override but never a production HTTP endpoint", async () => {
    await expect(assertSafeCommandEndpoint("https://127.0.0.1", true)).resolves.toBeUndefined();
    vi.stubEnv("NODE_ENV", "production");
    await expect(assertSafeCommandEndpoint("http://127.0.0.1", true)).rejects.toThrow("invalid_scheme_or_credentials");
  });
});
