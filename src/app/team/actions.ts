"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import { canManageTeam, inviteExpiry, wouldLeaveNoAdmin } from "@/domain/teams";
import { activeTeam, getViewer } from "@/lib/auth";
import { hashInviteToken, newInviteToken } from "@/lib/invitations";

const { auditLog, memberships, profiles, teamInvitations, teams } = schema;

const role = z.enum(["team_admin", "buyer", "viewer"]);

/** Only an approved team's admin gets past this, checked on every action. */
async function requireTeamAdmin() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/team");
  const team = activeTeam(viewer);
  if (!team || !canManageTeam(team.role)) throw new Error("Only a team admin can do this");
  return { viewer, team };
}

export type InviteState = ActionState & { link?: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role,
});

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Creates an invitation and returns its link once. Only the hash is kept, so it can't be shown again. */
export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { viewer, team } = await requireTeamAdmin();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "נא למלא כתובת דוא״ל תקינה" };
  const { email, role: inviteRole } = parsed.data;

  const [existing] = await db
    .select({ id: profiles.id })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(and(eq(memberships.teamId, team.id), eq(profiles.email, email)));
  if (existing) return { error: "המשתמש כבר חבר בקבוצה" };

  const token = newInviteToken();
  await db.transaction(async (tx) => {
    // A new link replaces any earlier one for this address.
    await tx
      .update(teamInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(teamInvitations.teamId, team.id),
          eq(teamInvitations.email, email),
          isNull(teamInvitations.acceptedAt),
          isNull(teamInvitations.revokedAt),
        ),
      );
    const [invitation] = await tx
      .insert(teamInvitations)
      .values({
        teamId: team.id,
        email,
        role: inviteRole,
        tokenHash: hashInviteToken(token),
        invitedBy: viewer.id,
        expiresAt: inviteExpiry(new Date()),
      })
      .returning();
    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "team_invitation",
      entityId: invitation.id,
      action: "create",
      after: { teamId: team.id, email, role: inviteRole },
    });
  });

  revalidatePath("/team");
  return { link: `${siteUrl()}/invite/${token}` };
}

export async function revokeInvitation(formData: FormData) {
  const { viewer, team } = await requireTeamAdmin();
  const id = z.uuid().parse(formData.get("id"));

  await db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(teamInvitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(teamInvitations.id, id), eq(teamInvitations.teamId, team.id), isNull(teamInvitations.acceptedAt)))
      .returning();
    if (!revoked) return;
    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "team_invitation",
      entityId: id,
      action: "revoke",
      before: { email: revoked.email, role: revoked.role },
    });
  });
  revalidatePath("/team");
}

async function changeMember(formData: FormData, newRole: "team_admin" | "buyer" | "viewer" | null): Promise<ActionState> {
  const { viewer, team } = await requireTeamAdmin();
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "הבקשה לא תקינה" };

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    // Locks the team, so two admins can't each demote the other at the same moment.
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, team.id)).for("update");
    const members = await tx
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.teamId, team.id));
    const member = members.find((m) => m.userId === userId.data);
    if (!member) return { error: "המשתמש אינו חבר בקבוצה" };
    if (wouldLeaveNoAdmin(members, userId.data, newRole)) return { error: "בקבוצה חייב להישאר לפחות מנהל אחד" };

    const where = and(eq(memberships.teamId, team.id), eq(memberships.userId, userId.data));
    if (newRole) await tx.update(memberships).set({ role: newRole }).where(where);
    else await tx.delete(memberships).where(where);

    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "membership",
      entityId: `${team.id}:${userId.data}`,
      action: newRole ? "change_role" : "remove",
      before: { role: member.role },
      after: newRole ? { role: newRole } : undefined,
    });
    return {};
  });

  revalidatePath("/team");
  return result;
}

export async function setMemberRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = role.safeParse(formData.get("role"));
  if (!parsed.success) return { error: "הרשאה לא תקינה" };
  return changeMember(formData, parsed.data);
}

export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return changeMember(formData, null);
}

const detailsSchema = z.object({
  name: z.string().trim().min(2).max(100),
  contactName: z.string().trim().max(100).default(""),
  contactPhone: z.string().trim().max(20).default(""),
  contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email())]).default(""),
  address: z.string().trim().max(500).default(""),
});

export async function updateTeamDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { viewer, team } = await requireTeamAdmin();
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "יש שדה לא תקין. בדקו את שם הקבוצה והדוא״ל." };
  const input = parsed.data;

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(teams).where(eq(teams.id, team.id)).for("update");
    const after = {
      name: input.name,
      contactName: input.contactName || null,
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
      address: input.address || null,
    };
    await tx.update(teams).set(after).where(eq(teams.id, team.id));
    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "team",
      entityId: team.id,
      action: "update_details",
      before: {
        name: before.name,
        contactName: before.contactName,
        contactPhone: before.contactPhone,
        contactEmail: before.contactEmail,
        address: before.address,
      },
      after,
    });
  });

  revalidatePath("/team");
  return {};
}
