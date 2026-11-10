import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { teamCanOrder } from "@/domain/orders";
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
  }[];
  /** The team picked in the team switcher (a cookie), when the user is in more than one. Not trusted: checked against `teams`. */
  preferredTeamId: string | null;
};

/** The team switcher's cookie (switchTeam in src/app/cart/actions.ts). */
export const TEAM_COOKIE = "cots-il-team";

/** The signed-in user, verified with the Auth server, or null. Once per request: the header, page and actions share it. */
export const getViewer = cache(async function getViewer(): Promise<Viewer | null> {
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
    .select({ team: schema.teams })
    .from(schema.memberships)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.memberships.teamId))
    .where(eq(schema.memberships.userId, profile.id))
    // Deterministic: the team joined first comes first (S1 task 11).
    .orderBy(asc(schema.memberships.createdAt), asc(schema.teams.number));
  const preferred = (await cookies()).get(TEAM_COOKIE)?.value ?? null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    isAdmin: profile.isAdmin,
    teams: rows.map(({ team }) => ({
      id: team.id,
      program: team.program,
      number: team.number,
      name: team.name,
      status: team.status,
      rejectionReason: team.rejectionReason,
    })),
    preferredTeamId: preferred,
  };
});

/** Signed in, and either an admin or a member of an approved team. */
export async function requireActiveViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin && !viewer.teams.some((t) => t.status === "active")) redirect("/pending");
  return viewer;
}

/** The approved team a user acts for, if any. Admins without a team have none. */
export function activeTeam(viewer: Viewer) {
  return viewer.teams.find((t) => t.status === "active") ?? null;
}

/**
 * The team a user builds a cart and orders for: an approved one, or a new one
 * still pending approval (its first request is reviewed with the team).
 */
export function orderingTeam(viewer: Viewer) {
  const picked = viewer.teams.find((t) => t.id === viewer.preferredTeamId && teamCanOrder(t.status));
  return picked ?? activeTeam(viewer) ?? viewer.teams.find((t) => teamCanOrder(t.status)) ?? null;
}

/** Teams this user can order for. The switcher shows only when there are two or more. */
export function orderingTeams(viewer: Viewer) {
  return viewer.teams.filter((t) => teamCanOrder(t.status));
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.isAdmin) redirect("/");
  return viewer;
}
