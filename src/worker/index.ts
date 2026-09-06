import { loadEnv } from "../config/env";

export function startWorker() {
  const env = loadEnv();
  console.log(JSON.stringify({ service: "worker", status: "ready", environment: env.NODE_ENV }));
}

if (import.meta.url === `file://${process.argv[1]}`) startWorker();
