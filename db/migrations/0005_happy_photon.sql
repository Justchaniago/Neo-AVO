ALTER TABLE "projects" ADD COLUMN "availability" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "operational_health" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_operational_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_successful_execution_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_execution_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_failure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_error_signature" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "expected_next_execution_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "stale_after_seconds" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "offline_after_seconds" integer DEFAULT 900 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "expected_interval_seconds" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "grace_period_seconds" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "criticality" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "target_rto_minutes" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_health_event_at" timestamp with time zone;