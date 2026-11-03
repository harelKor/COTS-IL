import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string;
  fullName: string | null;
  isAdmin: boolean;
  teams: {
    id: string;
    program: "FRC" | "FTC";
    number: number;
    name: string;
    status: "pending" | "active" | "rejected" | "suspended";
    rejectionReason: string | null;
    role: "team_admin" | "buyer" | "viewer";
  }[];
};

/** The signed-in user, verified with the Auth server, or null. */
export async function getViewer(): Promise<Viewer | null> {
  // Session checks depend on the clock and the request, so never prerender them.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.id, data.user.id),
  });
  if (!profile) return null;

  const rows = await db
    .select({ team: schema.teams, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.memberships.teamId))
    .where(eq(schema.memberships.userId, profile.id));

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    isAdmin: profile.isAdmin,
    teams: rows.map(({ team, role }) => ({
      id: team.id,
      program: team.program,
      number: team.number,
      name: team.name,
      status: team.status,
      rejectionReason: team.rejectionReason,
      role,
    })),
  };
}

/** Signed in, and either an admin or a member of an approved team. */
export async function requireActiveViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin && !viewer.teams.some((t) => t.status === "active")) redirect("/pending");
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.isAdmin) redirect("/");
  return viewer;
}
