-- Invitations hold email addresses and token hashes, so the app reads them on the
-- server with its permission checks, and through the API only admins can.

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "team_invitations_select" ON public.team_invitations FOR SELECT TO authenticated USING (
  (SELECT public.is_admin())
);
