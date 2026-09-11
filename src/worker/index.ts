import { loadEnv } from "../config/env";
import { createConfiguredDb } from "../db/client";
import { claimPendingEvent } from "./repository";
import { processClaimedEvent } from "./processor";
import { dispatchOneTelegramNotification, pollTelegramCommands, type TelegramPollState } from "../notifications/telegram";
import { runOneOpsAnalysis } from "../ops/analyst";
import { deliverOnePushCommand } from "../commands/delivery";
import { expireCommands } from "../commands/repository";
import { log } from "../observability/logger";
import { monitorProjectHealth } from "../health/monitor";
import { evaluateExpectedExecutions } from "../ops/expected-executions";
import { collectResourceSnapshot } from "../ops/resources";

export async function startWorker() {
  const env = loadEnv();
  const { db, pool } = createConfiguredDb();
  const workerId = `worker-${process.pid}`;
  let stopping = false;
  let lastHealthCheckAt = 0;
  let lastExpectedExecutionCheckAt = 0;
  let lastResourceSnapshotAt = 0;
  const telegramPollState: TelegramPollState = { offset: 0, lastPollAt: 0 };
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  log("info", "worker", "started", { environment: env.NODE_ENV, workerId });
  try {
    while (!stopping) {
      const event = await claimPendingEvent(db, workerId);
      if (event) await processClaimedEvent(db, event);
      else await new Promise((resolve) => setTimeout(resolve, 1000));
      if (Date.now() - lastHealthCheckAt >= 5_000) {
        await monitorProjectHealth(db);
        lastHealthCheckAt = Date.now();
      }
      if (Date.now() - lastExpectedExecutionCheckAt >= 60_000) {
        try { await evaluateExpectedExecutions(db); } catch (error) { log("error", "expected_execution", "evaluation_failed", { errorClass: error instanceof Error ? error.name : "unknown" }); }
        lastExpectedExecutionCheckAt = Date.now();
      }
      if (Date.now() - lastResourceSnapshotAt >= 30_000) {
        try { await collectResourceSnapshot(db); } catch (error) { log("error", "resources", "snapshot_failed", { errorClass: error instanceof Error ? error.name : "unknown" }); }
        lastResourceSnapshotAt = Date.now();
      }
      await dispatchOneTelegramNotification(db);
      try {
        await pollTelegramCommands(db, telegramPollState);
      } catch (error) {
        log("error", "telegram", "command_poll_failed", { errorClass: error instanceof Error ? error.name : "unknown" });
      }
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
