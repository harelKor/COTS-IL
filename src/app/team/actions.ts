"use server";

import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import { emailOffFromForm } from "@/domain/notifications";
import { inviteExpiry, isPersonName, isTeamName, wouldLeaveNoMembers } from "@/domain/teams";
import { getViewer, orderingTeam } from "@/lib/auth";
import { hashInviteToken, newInviteToken } from "@/lib/invitations";
import { siteUrl } from "@/lib/site-url";
import { emailEnabled, notifyInvite, notifyLater } from "@/lib/notify";
import { UNDO_SECONDS } from "@/domain/quote-view";

const { auditLog, memberships, profiles, teamInvitations, teamJoinRequests, teams } = schema;

/**
 * Anyone signed in to a team manages its account (D11): details, sign-in emails
 * and join requests, also while the team waits for approval. Checked on every action.
 */
async function requireTeamMember() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/team");
  const team = orderingTeam(viewer);
  if (!team) throw new Error("Only someone on a team that can order can do this");
  return { viewer, team };
}

export type InviteState = ActionState & { link?: string; email?: string; emailed?: boolean; teamName?: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});


/** Adds a sign-in email: creates an invitation and returns its link once. Only the hash is kept, so it can't be shown again. */
export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { viewer, team } = await requireTeamMember();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "נא למלא כתובת דוא״ל תקינה" };
  const { email } = parsed.data;

  const [existing] = await db
    .select({ id: profiles.id })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(and(eq(memberships.teamId, team.id), eq(profiles.email, email)));
  if (existing) return { error: "הכתובת כבר בחשבון הקבוצה" };

  const token = newInviteToken();
  const invitationId = await db.transaction(async (tx) => {
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
      after: { teamId: team.id, email },
    });
    return invitation.id;
  });

  const link = `${siteUrl()}/invite/${token}`;
  // S8: the new address gets its link by email (S3), and the form still offers Copy and WhatsApp.
  notifyLater(() => notifyInvite(team.id, invitationId, email, link));
  revalidatePath("/team");
  return { link, email, emailed: emailEnabled(), teamName: team.name };
}

export async function revokeInvitation(formData: FormData) {
  const { viewer, team } = await requireTeamMember();
  const idParsed = z.uuid().safeParse(formData.get("id"));
  if (!idParsed.success) return;
  const id = idParsed.data;

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
      before: { email: revoked.email },
    });
  });
  revalidatePath("/team");
}

/** Removes a sign-in email from the team's account. The last one stays, or nobody could sign in for the team. */
export async function removeMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { viewer, team } = await requireTeamMember();
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "הבקשה לא תקינה" };

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    // Locks the team, so two people can't each remove the other's email at the same moment.
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, team.id)).for("update");
    const members = await tx
      .select({ userId: memberships.userId, email: profiles.email })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(eq(memberships.teamId, team.id));
    const member = members.find((m) => m.userId === userId.data);
    if (!member) return { error: "הכתובת כבר לא בחשבון הקבוצה" };
    if (wouldLeaveNoMembers(members.map((m) => m.userId), userId.data)) {
      return { error: "זאת הכתובת האחרונה בחשבון הקבוצה. הוסיפו כתובת אחרת לפני שמסירים אותה." };
    }

    const [removed] = await tx.delete(memberships).where(and(eq(memberships.teamId, team.id), eq(memberships.userId, userId.data))).returning();
    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "membership",
      entityId: `${team.id}:${userId.data}`,
      action: "remove",
      before: { email: member.email, emailOff: removed?.emailOff ?? [], createdAt: removed?.createdAt },
    });
    return {};
  });

  revalidatePath("/team");
  return result;
}

/** Undo for "הסרה" (S8): puts an address removed in the last UNDO_SECONDS back, with its email settings. */
export async function restoreMember(userIdInput: string): Promise<ActionState> {
  const { viewer, team } = await requireTeamMember();
  const userId = z.uuid().safeParse(userIdInput);
  if (!userId.success) return { error: "הבקשה לא תקינה" };
  const since = new Date(Date.now() - (UNDO_SECONDS + 5) * 1000);
  const [last] = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, "membership"), eq(auditLog.entityId, `${team.id}:${userId.data}`), eq(auditLog.action, "remove"), gte(auditLog.at, since)))
    .orderBy(desc(auditLog.at))
    .limit(1);
  if (!last) return { error: "עבר הזמן לביטול. אפשר להוסיף את הכתובת שוב." };
  const before = (last.before ?? {}) as { emailOff?: string[]; createdAt?: string; email?: string };
  await db
    .insert(memberships)
    .values({ teamId: team.id, userId: userId.data, emailOff: before.emailOff ?? [], createdAt: before.createdAt ? new Date(before.createdAt) : undefined })
    .onConflictDoNothing();
  await db.insert(auditLog).values({ actorId: viewer.id, entity: "membership", entityId: `${team.id}:${userId.data}`, action: "restore", after: { email: before.email } });
  revalidatePath("/team");
  return {};
}

const detailsSchema = z.object({
  name: z.string().trim().max(100).refine(isTeamName),
  contactName: z.string().trim().max(100).refine((v) => v === "" || isPersonName(v)).default(""),
  contactPhone: z.string().trim().max(20).default(""),
  contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email())]).default(""),
  address: z.string().trim().max(500).default(""),
});

export async function updateTeamDetails(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { viewer, team } = await requireTeamMember();
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "יש שדה לא תקין. בדקו את שם הקבוצה (לפחות 3 תווים, עם אותיות), שם איש הקשר והדוא״ל." };
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
  return { ok: "הפרטים נשמרו" };
}

/**
 * "בקשת הצטרפות" from someone signed in: one tap adds their address to the
 * team's account, or declines. Either way the request is closed.
 */
export async function decideJoinRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { viewer, team } = await requireTeamMember();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "הבקשה לא תקינה" };
  const accept = formData.get("accept") === "1";

  const done = await db.transaction(async (tx) => {
    const [request] = await tx
      .update(teamJoinRequests)
      .set({ decidedAt: new Date(), decidedBy: viewer.id, accepted: accept })
      .where(and(eq(teamJoinRequests.id, id.data), eq(teamJoinRequests.teamId, team.id), isNull(teamJoinRequests.decidedAt)))
      .returning();
    if (!request) return false;
    if (accept) await tx.insert(memberships).values({ teamId: team.id, userId: request.userId }).onConflictDoNothing();
    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "team_join_request",
      entityId: request.id,
      action: accept ? "accept" : "decline",
      after: { teamId: team.id, email: request.email },
    });
    return true;
  });

  revalidatePath("/team");
  return done ? {} : { error: "הבקשה כבר טופלה" };
}

/**
 * Which emails one address on the team's account gets (S3). Anyone on the team can set
 * it for any of its addresses (D11). The request receipt and the quote itself always go.
 */
export async function setEmailPreferences(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { viewer, team } = await requireTeamMember();
  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "הבקשה לא תקינה" };
  const emailOff = emailOffFromForm(formData.getAll("on").map(String));

  const [updated] = await db
    .update(memberships)
    .set({ emailOff })
    .where(and(eq(memberships.teamId, team.id), eq(memberships.userId, userId.data)))
    .returning({ userId: memberships.userId });
  if (!updated) return { error: "הכתובת כבר לא בחשבון הקבוצה" };
  await db.insert(auditLog).values({
    actorId: viewer.id,
    entity: "membership",
    entityId: `${team.id}:${userId.data}`,
    action: "email_preferences",
    after: { emailOff },
  });
  revalidatePath("/team");
  return { ok: "ההגדרות נשמרו" };
}
