import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { loadEnv } from "../config/env";
import * as schema from "./schema";

export function createDb(databaseUrl: string, ssl: boolean) {
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: ssl ? { rejectUnauthorized: false } : false });
  return { db: drizzle(pool, { schema }), pool };
}

export function createConfiguredDb() {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for database operations");
  return createDb(env.DATABASE_URL, env.DATABASE_SSL === "require");
}
