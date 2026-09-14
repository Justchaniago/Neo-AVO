import type { createConfiguredDb } from "../db/client";
import { persistCapability } from "./repository";
import type { Capability, CloudProviderAdapter } from "./types";

type Db = ReturnType<typeof createConfiguredDb>["db"];
const capabilities: Capability[] = ["infrastructure", "cost", "credits"];

export async function collectProviders(db: Db, providers: CloudProviderAdapter[], due: Capability[], observedAt: Date, timeoutMs: number) {
  await Promise.all(providers.map(async (provider) => {
    await Promise.all(due.map(async (capability) => {
      const abort = new AbortController();
      const signal = abort.signal;
      let result;
      try {
        result = await withTimeout(provider.collect(capability, observedAt, signal), timeoutMs, abort);
      } catch (error) {
        result = { status: "ERROR" as const, error: error instanceof Error ? error.message : "provider collection failed" };
      }
      await persistCapability(db, provider.provider, capability, result, observedAt);
    }));
  }));
}

export async function collectOnce(db: Db, providers: CloudProviderAdapter[], timeoutMs: number, observedAt = new Date()) {
  await collectProviders(db, providers, capabilities, observedAt, timeoutMs);
}

async function withTimeout<T>(promiseFactory: Promise<T>, timeoutMs: number, abort: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error("provider timeout")); }, timeoutMs); });
  try { return await Promise.race([promiseFactory, timeout]); } finally { if (timer) clearTimeout(timer); }
}
