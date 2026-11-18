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

const MAX_EVENTS_PER_TICK = 20;

export async function startWorker() {
  const env = loadEnv();
  const { db, pool } = createConfiguredDb();
  const workerId = `worker-${process.pid}`;
  let stopping = false;
  let lastHealthCheckAt = 0;
  let lastExpectedExecutionCheckAt = 0;
  let lastResourceSnapshotAt = 0;
  let opsAnalysisPromise: Promise<unknown> | null = null;
  const telegramPollState: TelegramPollState = { offset: 0, lastPollAt: 0 };
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  log("info", "worker", "started", { environment: env.NODE_ENV, workerId });
  try {
    while (!stopping) {
      let processedCount = 0;
      try {
        while (!stopping && processedCount < MAX_EVENTS_PER_TICK) {
          const event = await claimPendingEvent(db, workerId);
          if (!event) break;
          await processClaimedEvent(db, event);
          processedCount += 1;
        }
      } catch (error) {
        log("error", "worker", "event_loop_failed", { errorClass: error instanceof Error ? error.name : "unknown" });
      }

      if (Date.now() - lastHealthCheckAt >= 5_000) {
        try { await monitorProjectHealth(db); } catch (error) { log("error", "health", "monitor_failed", { errorClass: error instanceof Error ? error.name : "unknown" }); }
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
      try { await dispatchOneTelegramNotification(db); } catch (error) { log("error", "telegram", "dispatch_failed", { errorClass: error instanceof Error ? error.name : "unknown" }); }
      try {
        await pollTelegramCommands(db, telegramPollState);
      } catch (error) {
        log("error", "telegram", "command_poll_failed", { errorClass: error instanceof Error ? error.name : "unknown" });
      }
      if (!opsAnalysisPromise) {
        opsAnalysisPromise = runOneOpsAnalysis(db)
          .catch((error) => { log("error", "ops_analyst", "worker_analysis_failed", { errorClass: error instanceof Error ? error.name : "unknown" }); })
          .finally(() => { opsAnalysisPromise = null; });
      }
      try { await expireCommands(db); } catch (error) { log("error", "commands", "expire_failed", { errorClass: error instanceof Error ? error.name : "unknown" }); }
      try { await deliverOnePushCommand(db); } catch (error) { log("error", "commands", "push_failed", { errorClass: error instanceof Error ? error.name : "unknown" }); }

      if (processedCount === 0 && !stopping) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (opsAnalysisPromise) await opsAnalysisPromise;
  } finally {
    log("info", "worker", "stopping", { workerId });
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) startWorker().catch((error: unknown) => { log("error", "worker", "startup_failed", { error: error instanceof Error ? error.message : "unknown" }); process.exitCode = 1; });
