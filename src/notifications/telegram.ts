import { loadEnv } from "../config/env";
import { claimPendingNotification, markNotificationFailed, markNotificationSent } from "./repository";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { log } from "../observability/logger";
import { buildTelegramCommandResponse, type TelegramCommand } from "./telegram-commands";

type Db = NodePgDatabase<typeof schema>;

const TELEGRAM_TIMEOUT_MS = 10_000;

function telegramApiUrl(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function configuredChatId(env: ReturnType<typeof loadEnv>) {
  return env.NEO_AVO_TELEGRAM_ALLOWED_CHAT_ID ?? env.TELEGRAM_CHAT_ID;
}

export async function sendTelegramMessage(message: string, chatId?: string) {
  const env = loadEnv();
  const allowedChatId = configuredChatId(env);
  if (!env.TELEGRAM_BOT_TOKEN || !allowedChatId) throw new Error("telegram credentials are not configured");
  const response = await fetch(telegramApiUrl(env.TELEGRAM_BOT_TOKEN, "sendMessage"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId ?? allowedChatId, text: message }), signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`telegram delivery failed with status ${response.status}`);
}

export async function verifyTelegramBot() {
  const env = loadEnv();
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("telegram bot token is not configured");
  const response = await fetch(telegramApiUrl(env.TELEGRAM_BOT_TOKEN, "getMe"), { signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`telegram bot authentication failed with status ${response.status}`);
  const payload = await response.json() as { ok?: boolean };
  if (payload.ok !== true) throw new Error("telegram bot authentication failed");
  return true;
}

export type TelegramPollState = { offset: number; lastPollAt: number };

export function parseTelegramCommand(text: string): TelegramCommand | null {
  const command = text.trim().split(/\s+/, 1)[0]?.toLowerCase().split("@", 1)[0];
  return command === "/status" || command === "/recent" || command === "/incidents" ? command.slice(1) as TelegramCommand : null;
}

export async function pollTelegramCommands(db: Db, state: TelegramPollState, now = Date.now()) {
  const env = loadEnv();
  const allowedChatId = configuredChatId(env);
  if (!env.TELEGRAM_BOT_TOKEN || !allowedChatId || now - state.lastPollAt < 5_000) return;
  state.lastPollAt = now;
  const query = new URLSearchParams({ timeout: "0", allowed_updates: JSON.stringify(["message"]) });
  if (state.offset > 0) query.set("offset", String(state.offset));
  const response = await fetch(`${telegramApiUrl(env.TELEGRAM_BOT_TOKEN, "getUpdates")}?${query.toString()}`, { signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`telegram update polling failed with status ${response.status}`);
  const payload = await response.json() as { ok?: boolean; result?: Array<{ update_id: number; message?: { chat?: { id?: number | string }; text?: string } }> };
  if (payload.ok !== true || !payload.result) return;
  for (const update of payload.result) {
    state.offset = Math.max(state.offset, update.update_id + 1);
    const chatId = update.message?.chat?.id;
    const text = update.message?.text;
    if (chatId === undefined || String(chatId) !== allowedChatId || !text) continue;
    const command = parseTelegramCommand(text);
    if (!command) continue;
    await sendTelegramMessage(await buildTelegramCommandResponse(db, command), allowedChatId);
  }
}

export async function dispatchOneTelegramNotification(db: Db) {
  const notification = await claimPendingNotification(db);
  if (!notification) return { status: "empty" as const };
  try {
    await sendTelegramMessage(notification.message);
    await markNotificationSent(db, notification.id, notification.claimToken!);
    return { status: "sent" as const };
  } catch (error) {
    await markNotificationFailed(db, notification.id, notification.claimToken!, error);
    log("error", "telegram", "delivery_failed", { notificationId: notification.id, incidentId: notification.incidentId, errorClass: error instanceof Error ? error.name : "unknown" });
    return { status: "failed" as const };
  }
}
