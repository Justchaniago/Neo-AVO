CREATE TABLE "ops_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"summary" text,
	"likely_cause" text,
	"confidence_basis_points" integer,
	"impact" text,
	"recommended_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text DEFAULT 'vertex_ai' NOT NULL,
	"model" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claim_token" text,
	"claimed_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ops_analyses" ADD CONSTRAINT "ops_analyses_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ops_analyses_incident_current_idx" ON "ops_analyses" USING btree ("incident_id");