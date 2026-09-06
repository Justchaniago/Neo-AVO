import { validateProductionEnv } from "../src/config/env";

try {
  const env = validateProductionEnv(process.env, { requireTelegram: process.env.REQUIRE_TELEGRAM === "1", requireVertex: process.env.REQUIRE_VERTEX === "1" });
  console.log(JSON.stringify({ status: "ok", database: Boolean(env.DATABASE_URL), telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID), vertex: Boolean(env.GOOGLE_CLOUD_PROJECT), commandEncryptionKey: Boolean(env.COMMAND_ENCRYPTION_KEY) }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "production_environment_invalid");
  process.exitCode = 1;
}
