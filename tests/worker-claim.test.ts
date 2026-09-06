import { describe, expect, it } from "vitest";

import { claimPendingEvent } from "../src/worker/repository";

describe("worker claiming", () => {
  it("uses skip-locked claiming so concurrent workers get distinct work", async () => {
    let available = true;
    const rawEvent = { id: "raw-1", processingAttempts: 0 };
    const tx = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: async (_mode: string, options: { skipLocked: boolean }) => {
                expect(options.skipLocked).toBe(true);
                if (!available) return [];
                available = false;
                return [rawEvent];
              },
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: async () => [{ ...rawEvent, claimToken: "claimed" }] }),
        }),
      }),
    };
    const db = { transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) };
    const results = await Promise.all([claimPendingEvent(db as never, "worker-a"), claimPendingEvent(db as never, "worker-b")]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
