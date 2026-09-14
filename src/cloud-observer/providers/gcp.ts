import type { AppEnv } from "../../config/env";
import { createUnavailableProvider } from "./unavailable";

// M0 keeps the GCP-native client seam explicit. Billing credits are unknown
// unless a supported billing source is configured; Cloud Console is never scraped.
export function createGcpProvider(env: AppEnv) {
  return createUnavailableProvider("GCP", env.GCP_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT ? "GCP read client not configured" : "GCP_PROJECT_ID is not configured");
}
