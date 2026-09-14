CREATE TABLE "cloud_cost_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"currency" text,
	"month_to_date_gross_cost" integer,
	"credits_applied" integer,
	"month_to_date_net_cost" integer,
	"daily_burn_rate" integer,
	"projected_month_end" integer,
	"value_status" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"provider_data_as_of" timestamp with time zone,
	"freshness" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_credit_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"credit_type" text NOT NULL,
	"currency" text,
	"original_amount" integer,
	"remaining_amount" integer,
	"estimated_remaining_amount" integer,
	"expiration" timestamp with time zone,
	"value_status" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"provider_data_as_of" timestamp with time zone,
	"freshness" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_observer_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"capability" text NOT NULL,
	"status" text NOT NULL,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"last_success_at" timestamp with time zone,
	"provider_data_as_of" timestamp with time zone,
	"safe_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_resource_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"account_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"region" text,
	"status" text NOT NULL,
	"cpu_utilization" integer,
	"memory_utilization" integer,
	"disk_utilization" integer,
	"network_in_bytes" integer,
	"network_out_bytes" integer,
	"observed_at" timestamp with time zone NOT NULL,
	"provider_data_as_of" timestamp with time zone,
	"freshness" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_observer_state_provider_capability_idx" ON "cloud_observer_state" USING btree ("provider","capability");