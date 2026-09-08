ALTER TABLE "notifications" ALTER COLUMN "incident_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedup_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedup_key_idx" ON "notifications" USING btree ("dedup_key") WHERE "notifications"."dedup_key" is not null;