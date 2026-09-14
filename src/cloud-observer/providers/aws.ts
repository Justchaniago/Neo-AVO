import type { AppEnv } from "../../config/env";
import { createUnavailableProvider } from "./unavailable";

// M0 keeps the AWS-native client seam explicit. The adapter reports unknown
// until a supported read-only AWS client is configured; it never scrapes the
// console or invents billing values.
export function createAwsProvider(env: AppEnv) {
  return createUnavailableProvider("AWS", env.AWS_REGION ? "AWS read client not configured" : "AWS_REGION is not configured");
}
