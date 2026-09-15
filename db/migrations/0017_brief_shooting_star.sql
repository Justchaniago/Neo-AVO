ALTER TABLE "cloud_credit_snapshots" ALTER COLUMN "original_amount" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "cloud_credit_snapshots" ALTER COLUMN "remaining_amount" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "cloud_credit_snapshots" ALTER COLUMN "estimated_remaining_amount" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "cloud_cost_snapshots" ADD COLUMN "breakdown" jsonb DEFAULT '{"services":{},"projects":{}}'::jsonb NOT NULL;