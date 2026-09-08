import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseTelegramCommand, pollTelegramCommands, verifyTelegramBot } from "../src/notifications/telegram";

describe("Neo AVO Telegram boundary", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.NEO_AVO_TELEGRAM_ALLOWED_CHAT_ID = "owner-chat";
    vi.restoreAllMocks();
  });

  it("accepts only the read-only command set", () => {
    expect(parseTelegramCommand("/status")).toBe("status");
    expect(parseTelegramCommand("/recent@neo_avo_bot")).toBe("recent");
    expect(parseTelegramCommand("/incidents extra text")).toBe("incidents");
    expect(parseTelegramCommand("/restart")).toBeNull();
    expect(parseTelegramCommand("ordinary text")).toBeNull();
  });

  it("verifies bot authentication without exposing response data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { id: 1 } }), { status: 200 })));
    await expect(verifyTelegramBot()).resolves.toBe(true);
  });

  it("advances past unauthorized chats without replying", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: [{ update_id: 8, message: { chat: { id: "other-chat" }, text: "/status" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const state = { offset: 0, lastPollAt: 0 };
    await pollTelegramCommands({} as never, state, 10_000);
    expect(state.offset).toBe(9);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
