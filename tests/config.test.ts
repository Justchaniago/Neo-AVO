import { describe, expect, it } from "vitest";

import { loadEnv } from "../src/config/env";

describe("environment configuration", () => {
  it("applies safe defaults", () => {
    expect(loadEnv({}).DATABASE_SSL).toBe("require");
  });

  it("rejects invalid database URLs", () => {
    expect(() => loadEnv({ DATABASE_URL: "not-a-url" })).toThrow();
  });
});
