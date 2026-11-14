-- M4 team management: addresses the admin blocked from claiming a team, and deleting a
-- test sign-in leaves its audit rows and join-request decisions with no actor instead of
-- refusing. RLS with no policy keeps blocked_emails away from the browser's API keys.
CREATE TABLE "blocked_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text,
	"blocked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocked_emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_id_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "team_join_requests" DROP CONSTRAINT "team_join_requests_decided_by_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "blocked_emails" ADD CONSTRAINT "blocked_emails_blocked_by_profiles_id_fk" FOREIGN KEY ("blocked_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_requests" ADD CONSTRAINT "team_join_requests_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;