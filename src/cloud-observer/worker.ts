import { loadEnv } from "../config/env";
import { withConfiguredDb } from "../db/client";
import { log } from "../observability/logger";
import { collectProviders } from "./collector";
import { createAwsProvider } from "./providers/aws";
import { createGcpProvider } from "./providers/gcp";
import { pruneCloudSnapshots } from "./repository";
import type { Capability } from "./types";
import type { CloudProviderAdapter } from "./types";
import type { GcpBillingConfig } from "./providers/gcp-billing";

function gcpBillingConfig(env: ReturnType<typeof loadEnv>): GcpBillingConfig | undefined {
  if (!env.GCP_BILLING_EXPORT_PROJECT || !env.GCP_BILLING_EXPORT_DATASET || !env.GCP_BILLING_EXPORT_TABLE) return undefined;
  return { billingProjectId: env.GCP_BILLING_EXPORT_PROJECT, dataset: env.GCP_BILLING_EXPORT_DATASET, table: env.GCP_BILLING_EXPORT_TABLE, creditAllocation: env.GCP_CREDIT_ALLOCATION };
}

export async function runCloudObserver(options: { env?: ReturnType<typeof loadEnv>; sleep?: (ms: number) => Promise<void>; providers?: CloudProviderAdapter[] } = {}) {
  const env = options.env ?? loadEnv();
  if (!env.CLOUD_OBSERVER_ENABLED) {
    log("info", "cloud-observer", "disabled; no provider collection performed");
    return { enabled: false };
  }
  const providers = options.providers ?? [createAwsProvider(env), createGcpProvider(env, { billing: gcpBillingConfig(env), wifCredentialsPath: env.CLOUD_OBSERVER_GCP_WIF_CREDENTIALS })];
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let next = Date.now();
  let nextCost = next;
  let nextCredits = next;
  try {
    while (!stopping) {
      const now = new Date();
      const current = Date.now();
      const due: Capability[] = ["infrastructure"];
      if (current >= nextCost) { due.push("cost"); nextCost = current + env.CLOUD_OBSERVER_COST_INTERVAL_MS; }
      if (current >= nextCredits) { due.push("credits"); nextCredits = current + env.CLOUD_OBSERVER_CREDITS_INTERVAL_MS; }
      await withConfiguredDb(async (db) => {
        await collectProviders(db, providers, due, now, env.CLOUD_OBSERVER_TIMEOUT_MS);
        await pruneCloudSnapshots(db, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
      });
      next += env.CLOUD_OBSERVER_INFRA_INTERVAL_MS;
      await sleep(Math.max(0, Math.min(next - Date.now(), nextCost - Date.now(), nextCredits - Date.now())));
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
  return { enabled: true };
}

if (import.meta.url === `file://${process.argv[1]}`) void runCloudObserver().catch((error) => {
  log("error", "cloud-observer", "observer stopped", { error: error instanceof Error ? error.message : "unknown" });
  process.exitCode = 1;
});
