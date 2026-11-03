-- Row Level Security and the sign-up trigger.
--
-- Access model: signed-in users can only READ rows of their own team(s)
-- (admins read everything). All writes go through server actions that check
-- permissions and use the direct DB connection, so there are deliberately no
-- insert/update/delete policies for the `authenticated` role.

CREATE INDEX "memberships_user_id_idx" ON "public"."memberships" ("user_id");--> statement-breakpoint

CREATE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false)
$$;--> statement-breakpoint

CREATE FUNCTION public.is_team_member(t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships m WHERE m.team_id = t AND m.user_id = auth.uid())
$$;--> statement-breakpoint

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Own profile, profiles of teammates, or everything for admins.
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (
  id = (SELECT auth.uid())
  OR (SELECT public.is_admin())
  OR EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.user_id = profiles.id AND (SELECT public.is_team_member(m.team_id))
  )
);--> statement-breakpoint

CREATE POLICY "teams_select" ON public.teams FOR SELECT TO authenticated USING (
  (SELECT public.is_team_member(id)) OR (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "memberships_select" ON public.memberships FOR SELECT TO authenticated USING (
  (SELECT public.is_team_member(team_id)) OR (SELECT public.is_admin())
);--> statement-breakpoint

CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated USING (true);--> statement-breakpoint

CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT TO authenticated USING (
  (SELECT public.is_admin())
);--> statement-breakpoint

-- Sign-up: every new auth user gets a profile. If the sign-up form sent team
-- details, a pending team is created with that user as its team admin.
CREATE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  new_team_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (new.id, new.email, meta->>'full_name', meta->>'phone');

  IF meta ? 'team_number' THEN
    INSERT INTO public.teams (program, number, name, contact_name, contact_phone, contact_email, address)
    VALUES (
      (meta->>'program')::public.program,
      (meta->>'team_number')::integer,
      meta->>'team_name',
      meta->>'full_name',
      meta->>'phone',
      new.email,
      meta->>'address'
    )
    RETURNING id INTO new_team_id;

    INSERT INTO public.memberships (team_id, user_id, role)
    VALUES (new_team_id, new.id, 'team_admin');
  END IF;

  RETURN new;
END
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;--> statement-breakpoint

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
