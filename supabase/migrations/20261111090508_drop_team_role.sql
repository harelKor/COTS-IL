-- D11 step 7b: stop writing `role`, then drop the columns and the enum.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
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

    INSERT INTO public.memberships (team_id, user_id)
    VALUES (new_team_id, new.id);
  END IF;

  RETURN new;
END
$$;--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "team_invitations" DROP COLUMN "role";--> statement-breakpoint
DROP TYPE "public"."team_role";