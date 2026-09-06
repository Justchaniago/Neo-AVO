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
    expect(validateProductionEnv({ NODE_ENV: "production", DATABASE_URL: "postgresql://localhost/db" }).DATABASE_URL).toContain("postgresql://");
  });
});
