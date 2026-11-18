import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { loadEnv } from "../config/env";
import * as schema from "./schema";

type ConfiguredDb = ReturnType<typeof createDb>;

const globalForDb = globalThis as typeof globalThis & {
  __neoAvoConfiguredDb?: ConfiguredDb;
  __neoAvoConfiguredDbKey?: string;
};

export function createDb(databaseUrl: string, ssl: boolean) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return { db: drizzle(pool, { schema }), pool };
}

export function createConfiguredDb() {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for database operations");
  return createDb(env.DATABASE_URL, env.DATABASE_SSL === "require");
}

function getSharedConfiguredDb(): ConfiguredDb {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for database operations");
  const key = `${env.DATABASE_URL}|${env.DATABASE_SSL}`;
  if (!globalForDb.__neoAvoConfiguredDb || globalForDb.__neoAvoConfiguredDbKey !== key) {
    globalForDb.__neoAvoConfiguredDb = createDb(env.DATABASE_URL, env.DATABASE_SSL === "require");
    globalForDb.__neoAvoConfiguredDbKey = key;
  }
  return globalForDb.__neoAvoConfiguredDb;
}

export async function withConfiguredDb<T>(operation: (db: ConfiguredDb["db"]) => Promise<T>) {
  const { db } = getSharedConfiguredDb();
  return operation(db);
}
