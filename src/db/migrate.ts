import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createConfiguredDb } from "./client";

const { db, pool } = createConfiguredDb();

async function runMigrations() {
  await migrate(db, { migrationsFolder: "./db/migrations" });
  await pool.end();
}

runMigrations().catch(async (error: unknown) => {
  await pool.end();
  console.error(error);
  process.exitCode = 1;
});
