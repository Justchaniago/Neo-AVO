ALTER TABLE "cloud_cost_snapshots" ALTER COLUMN "month_to_date_gross_cost" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "cloud_cost_snapshots" ALTER COLUMN "credits_applied" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "cloud_cost_snapshots" ALTER COLUMN "month_to_date_net_cost" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "cloud_cost_snapshots" ALTER COLUMN "daily_burn_rate" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "cloud_cost_snapshots" ALTER COLUMN "projected_month_end" SET DATA TYPE numeric(18, 6);