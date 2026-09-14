import type { createConfiguredDb } from "../db/client";
import { persistCapability } from "./repository";
import type { Capability, CloudProviderAdapter } from "./types";

type Db = ReturnType<typeof createConfiguredDb>["db"];
const capabilities: Capability[] = ["infrastructure", "cost", "credits"];

export async function collectProviders(db: Db, providers: CloudProviderAdapter[], due: Capability[], observedAt: Date, timeoutMs: number) {
  await Promise.all(providers.map(async (provider) => {
    await Promise.all(due.map(async (capability) => {
      let result;
      try {
        result = await withTimeout(provider.collect(capability, observedAt), timeoutMs);
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("provider timeout")), timeoutMs))]);
}
