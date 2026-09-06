CREATE TABLE "commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"command_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"capability" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"delivery_mode" text NOT NULL,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"next_delivery_at" timestamp with time zone,
	"claim_token" text,
	"claim_expires_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"result_at" timestamp with time zone,
	"result" jsonb,
	"failure_reason" text,
	"rejection_reason" text,
	"requested_by" text DEFAULT 'operator' NOT NULL,
	"audit_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commands_command_id_unique" UNIQUE("command_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "command_delivery_mode" text DEFAULT 'PULL' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "command_endpoint_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "command_auth_ciphertext" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "command_auth_iv" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "command_auth_tag" text;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;