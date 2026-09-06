import { loadEnv } from "../config/env";
import { createConfiguredDb } from "../db/client";
import { claimPendingEvent } from "./repository";
import { processClaimedEvent } from "./processor";
import { dispatchOneTelegramNotification } from "../notifications/telegram";
import { runOneOpsAnalysis } from "../ops/analyst";
import { deliverOnePushCommand } from "../commands/delivery";
import { expireCommands } from "../commands/repository";
import { log } from "../observability/logger";

export async function startWorker() {
  const env = loadEnv();
  const { db, pool } = createConfiguredDb();
  const workerId = `worker-${process.pid}`;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  log("info", "worker", "started", { environment: env.NODE_ENV, workerId });
  try {
    while (!stopping) {
      const event = await claimPendingEvent(db, workerId);
      if (event) await processClaimedEvent(db, event);
      else await new Promise((resolve) => setTimeout(resolve, 1000));
      await dispatchOneTelegramNotification(db);
      await runOneOpsAnalysis(db);
      await expireCommands(db);
      await deliverOnePushCommand(db);
    }
  } finally {
    log("info", "worker", "stopping", { workerId });
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) startWorker().catch((error: unknown) => { log("error", "worker", "startup_failed", { error: error instanceof Error ? error.message : "unknown" }); process.exitCode = 1; });
