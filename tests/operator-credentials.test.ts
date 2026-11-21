import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const findFirst = vi.fn();
vi.mock("../src/db/client", () => ({
  withConfiguredDb: (operation: (db: unknown) => Promise<unknown>) => operation({ query: { operatorCredentials: { findFirst } } }),
}));

import { middleware } from "../middleware";
import { changeCredentialsSchema, clearOperatorAuthCache, resolveOperatorAuth, verifyOperatorCredentials } from "../src/operator/credentials";
import { hashPassword, verifyPassword } from "../src/operator/password";

const envPassword = "environment-password-123";
const storedPassword = "changed-in-settings-456";
const basic = (value: string) => `Basic ${Buffer.from(value).toString("base64")}`;
const request = (credentials?: string) => new NextRequest("https://neo.example/api/v1/projects", credentials ? { headers: { authorization: basic(credentials) } } : undefined);

describe("stored operator credentials", () => {
  beforeEach(() => {
    vi.stubEnv("NEO_AVO_OPERATOR_USERNAME", "operator");
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", envPassword);
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/db");
    findFirst.mockReset();
    clearOperatorAuthCache();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("hashes with a random salt and verifies only the right password", async () => {
    const hash = await hashPassword(storedPassword);
    expect(hash).not.toContain(storedPassword);
    expect(hash).not.toBe(await hashPassword(storedPassword));
    expect(await verifyPassword(storedPassword, hash)).toBe(true);
    expect(await verifyPassword(`${storedPassword}x`, hash)).toBe(false);
    expect(await verifyPassword(storedPassword, "plain")).toBe(false);
  });

  it("uses the environment login until a password is saved", async () => {
    findFirst.mockResolvedValue(undefined);
    expect((await resolveOperatorAuth()).kind).toBe("env");
    expect((await middleware(request(`operator:${envPassword}`))).headers.get("x-middleware-next")).toBe("1");
  });

  it("falls back to the environment login when the table is not migrated yet", async () => {
    findFirst.mockRejectedValue(Object.assign(new Error("query failed"), { cause: { code: "42P01" } }));
    expect((await middleware(request(`operator:${envPassword}`))).headers.get("x-middleware-next")).toBe("1");
  });

  it("replaces the environment login once credentials are saved", async () => {
    findFirst.mockResolvedValue({ username: "ferry", passwordHash: await hashPassword(storedPassword), updatedAt: new Date() });
    expect((await middleware(request(`operator:${envPassword}`))).status).toBe(401);
    expect((await middleware(request(`operator:${storedPassword}`))).status).toBe(401);
    expect((await middleware(request(`ferry:${storedPassword}x`))).status).toBe(401);
    expect((await middleware(request(`ferry:${storedPassword}`))).headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(request(`ferry:${storedPassword}`))).headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(request(`ferry:${storedPassword}x`))).status).toBe(401);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the database cannot be read", async () => {
    findFirst.mockRejectedValue(new Error("connection refused"));
    const response = await middleware(request(`operator:${envPassword}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "operator_auth_unavailable" });
  });

  it("stops accepting a cached login when a refresh fails", async () => {
    vi.useFakeTimers();
    try {
      findFirst.mockResolvedValueOnce({ username: "ferry", passwordHash: await hashPassword(storedPassword), updatedAt: new Date() });
      expect((await middleware(request(`ferry:${storedPassword}`))).headers.get("x-middleware-next")).toBe("1");
      vi.advanceTimersByTime(11_000);
      findFirst.mockRejectedValue(new Error("connection refused"));
      expect((await middleware(request(`ferry:${storedPassword}`))).status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not hash the password for a wrong username", async () => {
    const auth = { kind: "stored" as const, username: "ferry", passwordHash: "scrypt$not-a-real-hash", updatedAt: new Date() };
    expect(await verifyOperatorCredentials(auth, `nobody:${storedPassword}`)).toBe(false);
  });

  it("accepts a burst of concurrent requests with the same valid login", async () => {
    const auth = { kind: "stored" as const, username: "ferry", passwordHash: await hashPassword(storedPassword), updatedAt: new Date() };
    const results = await Promise.all(Array.from({ length: 12 }, () => verifyOperatorCredentials(auth, `ferry:${storedPassword}`)));
    expect(results.every(Boolean)).toBe(true);
  });

  it("never accepts unresolved auth states", async () => {
    expect(await verifyOperatorCredentials({ kind: "unconfigured" }, "a:b")).toBe(false);
    expect(await verifyOperatorCredentials({ kind: "unavailable" }, "a:b")).toBe(false);
  });

  it("validates change requests", () => {
    expect(changeCredentialsSchema.safeParse({ currentPassword: "x", newPassword: "short" }).success).toBe(false);
    expect(changeCredentialsSchema.safeParse({ currentPassword: "x", newPassword: storedPassword, newUsername: "bad:name" }).success).toBe(false);
    expect(changeCredentialsSchema.safeParse({ currentPassword: "x", newPassword: storedPassword, newUsername: "ferry" }).success).toBe(true);
  });
});
