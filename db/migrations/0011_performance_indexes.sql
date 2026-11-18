CREATE INDEX IF NOT EXISTS "events_pending_claim_idx" ON "events" ("received_at") WHERE "processed_at" IS NULL AND "quarantined_at" IS NULL;
CREATE INDEX IF NOT EXISTS "events_project_env_occurred_idx" ON "events" ("project_id", "environment", "occurred_at" DESC);
CREATE INDEX IF NOT EXISTS "commands_project_env_status_idx" ON "commands" ("project_id", "environment", "status", "requested_at");
CREATE INDEX IF NOT EXISTS "notifications_pending_dispatch_idx" ON "notifications" ("status", "next_attempt_at") WHERE "status" IN ('PENDING', 'FAILED');
CREATE INDEX IF NOT EXISTS "resource_snapshots_scope_observed_idx" ON "resource_snapshots" ("scope", "observed_at" DESC);
