import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** M0 keeps only the database connectivity seam; domain tables start in M1. */
export const healthChecks = pgTable("health_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  environment: text("environment").notNull(),
  runtimeMode: text("runtime_mode").notNull(),
  healthStrategy: text("health_strategy").notNull(),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  availability: text("availability").notNull().default("UNKNOWN"),
  operationalHealth: text("operational_health").notNull().default("UNKNOWN"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastOperationalAt: timestamp("last_operational_at", { withTimezone: true }),
  lastSuccessfulExecutionAt: timestamp("last_successful_execution_at", { withTimezone: true }),
  lastExecutionAt: timestamp("last_execution_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastErrorSignature: text("last_error_signature"),
  expectedNextExecutionAt: timestamp("expected_next_execution_at", { withTimezone: true }),
  staleAfterSeconds: integer("stale_after_seconds").notNull().default(300),
  offlineAfterSeconds: integer("offline_after_seconds").notNull().default(900),
  expectedIntervalSeconds: integer("expected_interval_seconds"),
  gracePeriodSeconds: integer("grace_period_seconds"),
  criticality: text("criticality").notNull().default("normal"),
  targetRtoMinutes: integer("target_rto_minutes"),
  lastHealthEventAt: timestamp("last_health_event_at", { withTimezone: true }),
});

export const projectCredentials = pgTable(
  "project_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => ({ projectEnvironmentIdx: uniqueIndex("project_credentials_project_environment_idx").on(table.projectId, table.environment).where(sql`${table.revokedAt} is null`) }),
);

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: text("event_id").notNull().unique(),
  schemaVersion: integer("schema_version").notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  environment: text("environment").notNull(),
  type: text("type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  sequence: text("sequence"),
  data: jsonb("data").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processingAttempts: integer("processing_attempts").notNull().default(0),
  processingError: text("processing_error"),
  quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
  claimToken: text("claim_token"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    environment: text("environment").notNull(),
    externalTaskId: text("external_task_id").notNull(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    currentAttempt: integer("current_attempt").notNull().default(0),
    currentRunId: text("current_run_id"),
    lastSequence: text("last_sequence"),
    lastError: text("last_error"),
    lastErrorSignature: text("last_error_signature"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ taskScopeIdx: uniqueIndex("tasks_project_environment_external_id_idx").on(table.projectId, table.environment, table.externalTaskId) }),
);
