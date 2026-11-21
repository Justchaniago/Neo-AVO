import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";
import { credentialsEqual, decodeBasicCredentials, isPublicRequest } from "../src/config/operator-auth";

const password = "local-test-password-123";
const basic = (value: string) => `Basic ${Buffer.from(value).toString("base64")}`;

describe("operator authentication", () => {
  beforeEach(() => {
    vi.stubEnv("NEO_AVO_OPERATOR_USERNAME", "operator");
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", password);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["GET", "/api/health"], ["POST", "/api/v1/events"], ["GET", "/api/v1/commands/pending"],
    ["POST", "/api/v1/commands/cmd_123/ack"], ["POST", "/api/v1/commands/cmd_123/result"],
    ["GET", "/api/v1/projects/project-123"], ["PATCH", "/api/v1/projects/project-123"],
    ["POST", "/api/v1/projects/project-123/credentials/rotate"],
    ["GET", "/_next/static/chunks/app.js"], ["GET", "/_next/image"], ["HEAD", "/favicon.ico"],
    ["GET", "/robots.txt"], ["GET", "/sitemap.xml"],
  ])("leaves %s %s to its existing route authentication", async (method, path) => {
    expect(isPublicRequest(path, method)).toBe(true);
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", "");
    const response = await middleware(new NextRequest(`https://neo.example${path}`, { method }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    ["GET", "/"], ["GET", "/incidents"], ["GET", "/new-page"], ["GET", "/new-api"],
    ["POST", "/api/v1/projects"], ["GET", "/api/v1/projects"], ["POST", "/api/v1/commands"],
    ["GET", "/api/v1/commands"], ["GET", "/api/v1/dashboard/overview"],
    ["POST", "/api/v1/dashboard/incidents/id/resolve"], ["GET", "/api/v1/infrastructure"],
    ["GET", "/api/v1/cloud-observer"], ["GET", "/api/v1/commands/id/result"],
    ["POST", "/api/v1/commands/pending"], ["DELETE", "/api/v1/projects/id"],
    ["POST", "/api/v1/projects/id"], ["GET", "/api/v1/projects/id/extra"],
    ["POST", "/api/v1/projects/id/credentials/rotate/extra"], ["GET", "/api/v1/events"],
    ["POST", "/api/health"], ["GET", "/api/v1/dashboard/secret.js"], ["POST", "/_next/unknown"],
    ["GET", "/api/v1/commands/id/ack/extra"], ["GET", "/api/v1/projectsevil/id"],
  ])("protects %s %s by default", async (method, path) => {
    expect(isPublicRequest(path, method)).toBe(false);
    const response = await middleware(new NextRequest(`https://neo.example${path}`, { method }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Basic realm="Neo AVO", charset="UTF-8"');
  });

  it.each(["", "Bearer project-token", "Basic !!!", basic("operator"), basic("wrong:" + password), basic("operator:wrong")])("rejects invalid authorization %s", async (authorization) => {
    expect((await middleware(new NextRequest("https://neo.example/", { headers: { authorization } }))).status).toBe(401);
  });

  it.each([undefined, "", "short"])("fails closed when the password is %s", async (value) => {
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", value);
    const response = await middleware(new NextRequest("https://neo.example/"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "operator_auth_not_configured" });
  });

  it("fails closed without a username", async () => {
    vi.stubEnv("NEO_AVO_OPERATOR_USERNAME", undefined);
    expect((await middleware(new NextRequest("https://neo.example/"))).status).toBe(503);
  });

  it("passes valid UTF-8 credentials including a colon in the password", async () => {
    vi.stubEnv("NEO_AVO_OPERATOR_USERNAME", "opérateur");
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", `${password}:extra`);
    const response = await middleware(new NextRequest("https://neo.example/", { headers: { authorization: basic(`opérateur:${password}:extra`) } }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("compares fixed-size digests for equal, different-length, and Unicode input", async () => {
    expect(await credentialsEqual("", "")).toBe(true);
    expect(await credentialsEqual("é:secret", "é:secret")).toBe(true);
    expect(await credentialsEqual("secret", "secreT")).toBe(false);
    expect(await credentialsEqual("", password)).toBe(false);
    expect(await credentialsEqual(password, `${password}extra`)).toBe(false);
    expect(decodeBasicCredentials("Basic /w==")).toBeNull();
  });
});
