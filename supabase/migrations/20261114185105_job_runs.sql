-- M1: the outcome of each background job besides the supplier sync (backup, revalidate, the
-- daily digest, the watchdog), read by the health list. The app writes through its own DB
-- connection; RLS with no policy keeps it away from the browser's API keys.
CREATE TABLE "job_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"ok" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
ALTER TABLE "job_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "job_runs_job_at_idx" ON "job_runs" USING btree ("job","at");--> statement-breakpoint
CREATE INDEX "audit_log_email_at_idx" ON "audit_log" USING btree ("at") WHERE "audit_log"."action" LIKE 'email:%';
