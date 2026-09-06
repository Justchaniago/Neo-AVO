import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ claimPendingNotification: vi.fn(), markNotificationFailed: vi.fn(), markNotificationSent: vi.fn() }));
vi.mock("../src/notifications/repository", () => repo);

import { dispatchOneTelegramNotification } from "../src/notifications/telegram";

describe("Telegram failure isolation", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.TELEGRAM_BOT_TOKEN = "test-token"; process.env.TELEGRAM_CHAT_ID = "test-chat"; });

  it("marks delivery failed without throwing or changing incident state", async () => {
    repo.claimPendingNotification.mockResolvedValue({ id: "notification-1", claimToken: "claim-1", message: "[HIGH] failure" });
    repo.markNotificationFailed.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));
    const result = await dispatchOneTelegramNotification({} as never);
    expect(result.status).toBe("failed");
    expect(repo.markNotificationFailed).toHaveBeenCalledWith(expect.anything(), "notification-1", "claim-1", expect.any(Error));
  });
});
