import { loadEnv } from "../config/env";
import { claimPendingNotification, markNotificationFailed, markNotificationSent } from "./repository";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";

type Db = NodePgDatabase<typeof schema>;

export async function sendTelegramMessage(message: string) {
  const env = loadEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error("telegram credentials are not configured");
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: message }) });
  if (!response.ok) throw new Error(`telegram delivery failed with status ${response.status}`);
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
    return { status: "failed" as const };
  }
}
