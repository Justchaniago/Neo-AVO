import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_SSL: z.enum(["disable", "require"]).default("require"),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  NEO_AVO_TELEGRAM_ALLOWED_CHAT_ID: z.string().min(1).optional(),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  VERTEX_LOCATION: z.string().min(1).default("us-central1"),
  VERTEX_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
  COMMAND_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return envSchema.parse(source);
}

export function validateProductionEnv(source: Record<string, string | undefined> = process.env, options: { requireTelegram?: boolean; requireVertex?: boolean } = {}) {
  const env = loadEnv({ ...source, NODE_ENV: "production" });
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (options.requireTelegram && (!env.TELEGRAM_BOT_TOKEN || !(env.NEO_AVO_TELEGRAM_ALLOWED_CHAT_ID || env.TELEGRAM_CHAT_ID))) missing.push("TELEGRAM_BOT_TOKEN", "NEO_AVO_TELEGRAM_ALLOWED_CHAT_ID");
  if (options.requireVertex && !env.GOOGLE_CLOUD_PROJECT) missing.push("GOOGLE_CLOUD_PROJECT");
  if (missing.length) throw new Error(`Missing production environment: ${[...new Set(missing)].join(", ")}`);
  return env;
}
