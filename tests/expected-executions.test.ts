import { describe, expect, it } from "vitest";
import { contractEffectiveAt, expectedAtForDay, expectedAtForEvent } from "../src/ops/expected-executions";

describe("expected execution schedule changes", () => {
  it("does not retroactively miss a schedule updated after today's target time", () => {
    const now = new Date("2026-10-07T04:30:00+07:00");
    const expectedAt = expectedAtForDay(now, "Asia/Jakarta", "daily 00:00");
    expect(expectedAt?.toISOString()).toBe("2026-10-06T17:00:00.000Z");
    expect(contractEffectiveAt({ createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: now }, expectedAt!)).toBe(false);
  });

  it("starts evaluating the configured schedule on the next occurrence", () => {
    const updatedAt = new Date("2026-10-07T04:30:00+07:00");
    const nextDayTarget = new Date("2026-10-07T17:00:00Z");
    expect(contractEffectiveAt({ createdAt: updatedAt, updatedAt }, nextDayTarget)).toBe(true);
  });

  it("maps a late event only to the scheduled occurrence on its local calendar day", () => {
    const lateSameDay = expectedAtForEvent(new Date("2026-10-07T00:05:00+07:00"), "Asia/Jakarta", "daily 00:00");
    expect(lateSameDay?.toISOString()).toBe("2026-10-06T17:00:00.000Z");
    const nextLocalDate = expectedAtForEvent(new Date("2026-10-08T00:05:00+07:00"), "Asia/Jakarta", "daily 00:00");
    expect(nextLocalDate?.toISOString()).toBe("2026-10-07T17:00:00.000Z");
    expect(nextLocalDate?.getTime()).not.toBe(lateSameDay?.getTime());
  });
});
