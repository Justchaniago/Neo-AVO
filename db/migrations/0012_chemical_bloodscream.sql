CREATE TABLE "resource_aggregates_1h" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text DEFAULT 'shared-prod-01' NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"sample_count" integer NOT NULL,
	"cpu_percent_mean" integer NOT NULL,
	"cpu_percent_max" integer NOT NULL,
	"memory_percent_mean" integer NOT NULL,
	"memory_percent_max" integer NOT NULL,
	"disk_percent_mean" integer NOT NULL,
	"disk_percent_max" integer NOT NULL,
	"pressure_state_peak" text DEFAULT 'NORMAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_aggregates_5m" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text DEFAULT 'shared-prod-01' NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"sample_count" integer NOT NULL,
	"cpu_percent_mean" integer NOT NULL,
	"cpu_percent_max" integer NOT NULL,
	"memory_percent_mean" integer NOT NULL,
	"memory_percent_max" integer NOT NULL,
	"disk_percent_mean" integer NOT NULL,
	"disk_percent_max" integer NOT NULL,
	"pressure_state_peak" text DEFAULT 'NORMAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "resource_aggregates_1h_host_bucket_idx" ON "resource_aggregates_1h" USING btree ("host_id","bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_aggregates_5m_host_bucket_idx" ON "resource_aggregates_5m" USING btree ("host_id","bucket_start");