CREATE TABLE "part_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"user_id" uuid,
	"url" text NOT NULL,
	"note" text,
	"query" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_requests_open_idx" ON "part_requests" USING btree ("handled_at","created_at");--> statement-breakpoint
-- Written and read only by the server (requestPart, the admin page); no client policies.
ALTER TABLE "part_requests" ENABLE ROW LEVEL SECURITY;
