import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";
import { DELETE as signOut, POST as signIn } from "../app/api/v1/operator/session/route";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, safeNextPath, verifySessionToken } from "../src/operator/session";
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
    ["GET", "/robots.txt"], ["GET", "/sitemap.xml"], ["GET", "/login"],
    ["POST", "/api/v1/operator/session"], ["DELETE", "/api/v1/operator/session"],
  ])("leaves %s %s to its existing route authentication", async (method, path) => {
    expect(isPublicRequest(path, method)).toBe(true);
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", "");
    const response = await middleware(new NextRequest(`https://neo.example${path}`, { method }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    ["POST", "/login"], ["GET", "/api/v1/operator/session"], ["GET", "/api/v1/operator/credentials"],
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
    // No Basic challenge: the browser must show the sign-in page, not its own prompt.
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it.each([["/", "/login"], ["/incidents?state=OPEN", "/login?next=%2Fincidents%3Fstate%3DOPEN"], ["/new-page", "/login?next=%2Fnew-page"]])("sends signed-out page request %s to the sign-in page", async (path, target) => {
    expect(isPublicRequest(path.split("?")[0], "GET")).toBe(false);
    const response = await middleware(new NextRequest(`https://neo.example${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://neo.example${target}`);
  });

  it("accepts a session cookie, and rejects expired, forged and outdated ones", async () => {
    const auth = { kind: "env" as const, username: "operator", password };
    const request = (token: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
      middleware(new NextRequest("https://neo.example/api/v1/projects", { ...init, headers: { cookie: `${SESSION_COOKIE}=${token}`, ...init.headers } }));
    const token = createSessionToken(auth);
    expect((await request(token)).headers.get("x-middleware-next")).toBe("1");
    expect((await request(token, { method: "POST", headers: { "sec-fetch-site": "same-origin" } })).headers.get("x-middleware-next")).toBe("1");
    expect((await request(token, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await request(createSessionToken(auth, Date.now() - SESSION_TTL_SECONDS * 1000 - 1))).status).toBe(401);
    for (const last of "ABCDEFGH") if (!token.endsWith(last)) expect((await request(token.slice(0, -1) + last)).status).toBe(401);
    expect((await request(token.replace(/^v1\.\d+/, `v1.${Date.now() + 10 * SESSION_TTL_SECONDS * 1000}`))).status).toBe(401);
    // Changing the login signs existing sessions out.
    expect((await request(createSessionToken({ ...auth, password: "another-test-password-456" }))).status).toBe(401);
    expect(verifySessionToken({ kind: "unconfigured" }, token)).toBe(false);
  });

  it("signs in and out through the session route", async () => {
    const post = (body: unknown) => signIn(new NextRequest("https://neo.example/api/v1/operator/session", { method: "POST", body: JSON.stringify(body) }));
    expect((await post({ username: "operator", password: "wrong" })).status).toBe(401);
    expect((await post({ username: "operator" })).status).toBe(401);
    const response = await post({ username: "operator", password });
    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
    expect(verifySessionToken({ kind: "env", username: "operator", password }, cookie?.value)).toBe(true);
    expect((await signOut()).cookies.get(SESSION_COOKIE)).toMatchObject({ value: "", maxAge: 0 });
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", "");
    expect((await post({ username: "operator", password })).status).toBe(503);
  });

  it("only follows same-site paths after sign-in", () => {
    expect(safeNextPath("/incidents?state=OPEN")).toBe("/incidents?state=OPEN");
    for (const value of [null, "", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/a\\b", "https://evil.example", "/login?next=/"]) expect(safeNextPath(value)).toBe("/");
  });

  it.each(["", "Bearer project-token", "Basic !!!", basic("operator"), basic("wrong:" + password), basic("operator:wrong")])("rejects invalid authorization %s", async (authorization) => {
    expect((await middleware(new NextRequest("https://neo.example/api/v1/projects", { headers: { authorization } }))).status).toBe(401);
  });

  it.each([undefined, "", "short"])("fails closed when the password is %s", async (value) => {
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", value);
    const response = await middleware(new NextRequest("https://neo.example/api/v1/projects"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "operator_auth_not_configured" });
  });

  it("fails closed without a username", async () => {
    vi.stubEnv("NEO_AVO_OPERATOR_USERNAME", undefined);
    expect((await middleware(new NextRequest("https://neo.example/api/v1/projects"))).status).toBe(503);
  });

  it("passes valid UTF-8 credentials including a colon in the password", async () => {
    vi.stubEnv("NEO_AVO_OPERATOR_USERNAME", "opérateur");
    vi.stubEnv("NEO_AVO_OPERATOR_PASSWORD", `${password}:extra`);
    const response = await middleware(new NextRequest("https://neo.example/api/v1/projects", { headers: { authorization: basic(`opérateur:${password}:extra`) } }));
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
