import { describe, expect, it } from "vitest";

import { loadEnv, validateProductionEnv } from "../src/config/env";

describe("environment configuration", () => {
  it("applies safe defaults", () => {
    expect(loadEnv({}).DATABASE_SSL).toBe("require");
  });

  it("rejects invalid database URLs", () => {
    expect(() => loadEnv({ DATABASE_URL: "not-a-url" })).toThrow();
  });

  it("validates base production requirements independently from optional subsystems", () => {
    expect(() => validateProductionEnv({ NODE_ENV: "production" })).toThrow("DATABASE_URL");
    expect(() => validateProductionEnv({ NODE_ENV: "production", DATABASE_URL: "postgresql://localhost/db" }, { requireTelegram: true })).toThrow("TELEGRAM_BOT_TOKEN");
    expect(validateProductionEnv({ NODE_ENV: "production", DATABASE_URL: "postgresql://localhost/db", NEO_AVO_OPERATOR_USERNAME: "operator", NEO_AVO_OPERATOR_PASSWORD: "test-password-at-least-16" }).DATABASE_URL).toContain("postgresql://");
  });

  it("requires operator credentials in production and validates password length", () => {
    expect(() => validateProductionEnv({ DATABASE_URL: "postgresql://localhost/db" })).toThrow("NEO_AVO_OPERATOR_USERNAME");
    expect(() => validateProductionEnv({ DATABASE_URL: "postgresql://localhost/db", NEO_AVO_OPERATOR_USERNAME: "operator" })).toThrow("NEO_AVO_OPERATOR_PASSWORD");
    expect(() => loadEnv({ NEO_AVO_OPERATOR_PASSWORD: "short" })).toThrow();
    expect(() => loadEnv({ NEO_AVO_OPERATOR_USERNAME: "bad:user" })).toThrow();
    expect(loadEnv({}).NEO_AVO_ALLOW_PRIVATE_COMMAND_ENDPOINTS).toBe(false);
    expect(loadEnv({ NEO_AVO_ALLOW_PRIVATE_COMMAND_ENDPOINTS: "true" }).NEO_AVO_ALLOW_PRIVATE_COMMAND_ENDPOINTS).toBe(true);
  });
});
