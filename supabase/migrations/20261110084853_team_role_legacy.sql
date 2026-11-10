-- D11 (Nov 10, 2026): one kind of team account, no roles. Step 7a of session S0
-- in docs/IMPROVEMENT-PLAN.md: the code stops reading `role`, new rows get
-- 'team_admin' by default, and every existing row becomes 'team_admin' so old
-- approve links and any role check still running mid-deploy keep working.
-- Step 7b (a later cleanup, after one deploy) drops the columns and the enum.
ALTER TABLE "memberships" ALTER COLUMN "role" SET DEFAULT 'team_admin';--> statement-breakpoint
ALTER TABLE "team_invitations" ALTER COLUMN "role" SET DEFAULT 'team_admin';--> statement-breakpoint
UPDATE "memberships" SET "role" = 'team_admin' WHERE "role" <> 'team_admin';--> statement-breakpoint
UPDATE "team_invitations" SET "role" = 'team_admin'
WHERE "role" <> 'team_admin' AND "accepted_at" IS NULL AND "revoked_at" IS NULL;
