import type { Capability, CloudProvider, CloudProviderAdapter } from "../types";

export function createUnavailableProvider(provider: CloudProvider, reason: string): CloudProviderAdapter {
  return {
    provider,
    async collect(_capability: Capability) {
      return { status: reason === "unauthorized" ? "UNAUTHORIZED" : "UNAVAILABLE", error: reason };
    },
  };
}
