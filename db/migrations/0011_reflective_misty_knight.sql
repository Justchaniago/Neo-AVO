CREATE TABLE "expected_execution_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"expected_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'MISSED' NOT NULL,
	"missed_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"source_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_analysis_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"trigger" text NOT NULL,
	"model" text,
	"status" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'neo-avo-host' NOT NULL,
	"cpu_percent" integer,
	"memory_percent" integer,
	"disk_percent" integer,
	"service_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expected_execution_occurrences" ADD CONSTRAINT "expected_execution_occurrences_contract_id_expected_execution_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."expected_execution_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_execution_occurrences" ADD CONSTRAINT "expected_execution_occurrences_source_event_id_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_analysis_invocations" ADD CONSTRAINT "ops_analysis_invocations_analysis_id_ops_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."ops_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expected_execution_occurrences_contract_time_idx" ON "expected_execution_occurrences" USING btree ("contract_id","expected_at");