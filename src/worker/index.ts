import { loadEnv } from "../config/env";
import { createConfiguredDb } from "../db/client";
import { claimPendingEvent } from "./repository";
import { processClaimedEvent } from "./processor";
import { dispatchOneTelegramNotification } from "../notifications/telegram";

export async function startWorker() {
  const env = loadEnv();
  const { db, pool } = createConfiguredDb();
  const workerId = `worker-${process.pid}`;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(JSON.stringify({ service: "worker", status: "ready", environment: env.NODE_ENV, workerId }));
  try {
    while (!stopping) {
      const event = await claimPendingEvent(db, workerId);
      if (event) await processClaimedEvent(db, event);
      else await new Promise((resolve) => setTimeout(resolve, 1000));
      await dispatchOneTelegramNotification(db);
    }
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) startWorker().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
