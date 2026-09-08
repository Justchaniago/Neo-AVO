import { describe, expect, it } from "vitest";

import { isNotifiableHealthTransition } from "../src/health/notifications";

describe("health notification transitions", () => {
  it("notifies only the bounded operational transitions", () => {
    expect(isNotifiableHealthTransition("availability", "ONLINE", "STALE")).toBe(true);
    expect(isNotifiableHealthTransition("availability", "STALE", "OFFLINE")).toBe(true);
    expect(isNotifiableHealthTransition("availability", "OFFLINE", "ONLINE")).toBe(true);
    expect(isNotifiableHealthTransition("health", "HEALTHY", "DEGRADED")).toBe(true);
    expect(isNotifiableHealthTransition("health", "DEGRADED", "FAILING")).toBe(true);
    expect(isNotifiableHealthTransition("health", "FAILING", "HEALTHY")).toBe(true);
    expect(isNotifiableHealthTransition("health", "HEALTHY", "HEALTHY")).toBe(false);
    expect(isNotifiableHealthTransition("availability", "UNKNOWN", "OFFLINE")).toBe(false);
  });
});
