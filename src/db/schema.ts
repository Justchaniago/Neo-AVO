import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

/** M0 keeps only the database connectivity seam; domain tables start in M1. */
export const healthChecks = pgTable("health_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});
