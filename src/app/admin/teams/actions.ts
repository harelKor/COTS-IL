"use server";

import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import {
  canDeleteTeam,
  canDeleteUser,
  CART_MAX_QTY,
  changedFields,
  nextStatus,
  normalizeEmail,
  parseAdminTeam,
  transferRemovals,
  usersToDeleteWithTeam,
} from "@/domain/team-admin";
import { inviteExpiry, wouldLeaveNoMembers } from "@/domain/teams";
import { requireAdmin } from "@/lib/auth";
import { hashInviteToken, newInviteToken } from "@/lib/invitations";
import { notifyInvite, notifyLater } from "@/lib/notify";
import { siteUrl } from "@/lib/site-url";

/**
 * The admin's team management (M4). Every action checks requireAdmin first, runs in one
 * transaction that locks the team, and writes what it did to audit_log. Pure rules are
 * in src/domain/team-admin.ts.
 */

const {
  auditLog,
  blockedEmails,
  deliveries,
  memberships,
  partRequests,
  profiles,
  quoteApprovals,
  teamInvitations,
  teamJoinRequests,
  teamOrders,
  teams,
} = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const uuid = z.uuid();
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

function refreshTeam(teamId?: string) {
  revalidatePath("/admin", "layout");
  if (teamId) revalidatePath(`/admin/teams/${teamId}`);
}

async function lockTeam(tx: Tx, teamId: string) {
  const [team] = await tx.select().from(teams).where(eq(teams.id, teamId)).for("update");
  return team ?? null;
}

const teamMembers = (tx: Tx, teamId: string) =>
  tx
    .select({ userId: memberships.userId, email: profiles.email, isAdmin: profiles.isAdmin, emailOff: memberships.emailOff, createdAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(eq(memberships.teamId, teamId));

async function isBlocked(tx: Tx, email: string) {
  const [row] = await tx.select({ email: blockedEmails.email }).from(blockedEmails).where(eq(blockedEmails.email, email));
  return !!row;
}

async function block(tx: Tx, adminId: string, emails: string[], reason: string | null) {
  for (const email of emails) {
    const [added] = await tx.insert(blockedEmails).values({ email, reason, blockedBy: adminId }).onConflictDoNothing().returning();
    if (added) await tx.insert(auditLog).values({ actorId: adminId, entity: "blocked_email", entityId: email, action: "block", after: { email, reason } });
  }
}

type SignIn = { kind: "member"; userId: string } | { kind: "already" } | { kind: "invited"; invitationId: string; link: string };

/**
 * Puts an address on a team: someone who has signed in before joins at once; anyone else
 * gets an invitation that joins them at their first sign-in (acceptInvitationsForUser).
 */
async function addSignIn(tx: Tx, adminId: string, teamId: string, email: string): Promise<SignIn> {
  const [profile] = await tx.select({ id: profiles.id }).from(profiles).where(sql`lower(${profiles.email}) = ${email}`);
  if (profile) {
    const [added] = await tx.insert(memberships).values({ teamId, userId: profile.id }).onConflictDoNothing().returning();
    if (!added) return { kind: "already" };
    await tx.insert(auditLog).values({ actorId: adminId, entity: "membership", entityId: `${teamId}:${profile.id}`, action: "add", after: { email, by: "admin" } });
    // Their own "בקשת הצטרפות" is answered by this.
    await tx
      .update(teamJoinRequests)
      .set({ decidedAt: new Date(), decidedBy: adminId, accepted: true })
      .where(and(eq(teamJoinRequests.teamId, teamId), eq(teamJoinRequests.userId, profile.id), isNull(teamJoinRequests.decidedAt)));
    return { kind: "member", userId: profile.id };
  }
  const token = newInviteToken();
  await tx
    .update(teamInvitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(teamInvitations.teamId, teamId), eq(teamInvitations.email, email), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt)));
  const [invitation] = await tx
    .insert(teamInvitations)
    .values({ teamId, email, tokenHash: hashInviteToken(token), invitedBy: adminId, expiresAt: inviteExpiry(new Date()) })
    .returning({ id: teamInvitations.id });
  await tx.insert(auditLog).values({ actorId: adminId, entity: "team_invitation", entityId: invitation.id, action: "create", after: { teamId, email, by: "admin" } });
  return { kind: "invited", invitationId: invitation.id, link: `${siteUrl()}/invite/${token}` };
}

const signInMessage = (result: SignIn) =>
  result.kind === "member"
    ? "הכתובת נוספה, ואפשר להיכנס איתה מיד."
    : result.kind === "already"
      ? "הכתובת כבר בחשבון הקבוצה."
      : "הכתובת עוד לא נכנסה לאתר: היא תצורף לקבוצה בכניסה הראשונה שלה (נשלחה גם הזמנה במייל, אם המיילים פעילים).";

/** "פרטי הקבוצה": name, programme, number and contact, with the registration's name checks. */
export async function updateTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const teamId = uuid.safeParse(formData.get("teamId"));
  if (!teamId.success) return { error: "הבקשה לא תקינה" };
  const parsed = parseAdminTeam(Object.fromEntries(formData));
  if (!parsed.ok) return { error: parsed.error };
  const next = parsed.value;

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const before = await lockTeam(tx, teamId.data);
    if (!before) return { error: "הקבוצה לא נמצאה" };
    const [taken] = await tx
      .select({ name: teams.name })
      .from(teams)
      .where(and(eq(teams.program, next.program), eq(teams.number, next.number), ne(teams.id, before.id)));
    if (taken) {
      return { error: `${next.program} ${next.number} כבר רשום לקבוצה ״${taken.name}״. אם זאת אותה קבוצה, אחדו אותן; אם המספר נתפס בטעות, העבירו אותו מהדף שלה.` };
    }
    const diff = changedFields(before, next);
    if (Object.keys(diff.after).length === 0) return { ok: "אין שינויים לשמור" };
    await tx.update(teams).set(next).where(eq(teams.id, before.id));
    await tx.insert(auditLog).values({ actorId: admin.id, entity: "team", entityId: before.id, action: "admin_update", before: diff.before, after: diff.after });
    return { ok: "הפרטים נשמרו" };
  });
  refreshTeam(teamId.data);
  return result;
}

/** Adds a sign-in email to a team (or invites it, if it never signed in). */
export async function addTeamEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const teamId = uuid.safeParse(formData.get("teamId"));
  const email = emailSchema.safeParse(formData.get("email"));
  if (!teamId.success) return { error: "הבקשה לא תקינה" };
  if (!email.success) return { error: "נא למלא כתובת דוא״ל תקינה" };

  const result = await db.transaction(async (tx): Promise<{ error: string } | SignIn> => {
    if (!(await lockTeam(tx, teamId.data))) return { error: "הקבוצה לא נמצאה" };
    if (await isBlocked(tx, email.data)) return { error: "הכתובת חסומה. בטלו את החסימה בדף ״קבוצות״ לפני שמוסיפים אותה." };
    return addSignIn(tx, admin.id, teamId.data, email.data);
  });
  if ("error" in result) return result;
  if (result.kind === "invited") notifyLater(() => notifyInvite(teamId.data, result.invitationId, email.data, result.link));
  refreshTeam(teamId.data);
  return { ok: signInMessage(result) };
}

/** Takes a sign-in email off a team. The last one stays, or nobody could sign in for the team. */
export async function removeTeamEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const teamId = uuid.safeParse(formData.get("teamId"));
  const userId = uuid.safeParse(formData.get("userId"));
  if (!teamId.success || !userId.success) return { error: "הבקשה לא תקינה" };

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    if (!(await lockTeam(tx, teamId.data))) return { error: "הקבוצה לא נמצאה" };
    const members = await teamMembers(tx, teamId.data);
    const member = members.find((m) => m.userId === userId.data);
    if (!member) return { error: "הכתובת כבר לא בחשבון הקבוצה" };
    if (wouldLeaveNoMembers(members.map((m) => m.userId), userId.data)) {
      return { error: "זאת הכתובת האחרונה של הקבוצה. הוסיפו כתובת אחרת קודם, או העבירו את הקבוצה לכתובת חדשה." };
    }
    await tx.delete(memberships).where(and(eq(memberships.teamId, teamId.data), eq(memberships.userId, userId.data)));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "membership",
      entityId: `${teamId.data}:${userId.data}`,
      action: "remove",
      before: { email: member.email, emailOff: member.emailOff, createdAt: member.createdAt, by: "admin" },
    });
    return { ok: `${member.email} הוסרה מהקבוצה` };
  });
  refreshTeam(teamId.data);
  return result;
}

export async function revokeTeamInvitation(formData: FormData) {
  const admin = await requireAdmin();
  const teamId = uuid.safeParse(formData.get("teamId"));
  const id = uuid.safeParse(formData.get("id"));
  if (!teamId.success || !id.success) return;
  await db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(teamInvitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(teamInvitations.id, id.data), eq(teamInvitations.teamId, teamId.data), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt)))
      .returning();
    if (revoked) {
      await tx.insert(auditLog).values({ actorId: admin.id, entity: "team_invitation", entityId: id.data, action: "revoke", before: { email: revoked.email }, after: { teamId: teamId.data, by: "admin" } });
    }
  });
  refreshTeam(teamId.data);
}

/**
 * "העברת המספר": someone claimed this team's number by mistake (or on purpose). The right
 * address joins; with "replace" every current sign-in leaves, their open invitations and
 * the cart they built go too, and they can be blocked from claiming a team again. Orders stay.
 */
export async function transferTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const teamId = uuid.safeParse(formData.get("teamId"));
  const email = emailSchema.safeParse(formData.get("email"));
  const mode = formData.get("mode") === "add" ? "add" : "replace";
  const blockRemoved = formData.get("block") === "on";
  if (!teamId.success) return { error: "הבקשה לא תקינה" };
  if (!email.success) return { error: "נא למלא את כתובת הדוא״ל של הקבוצה האמיתית" };

  const result = await db.transaction(async (tx): Promise<{ error: string } | { signIn: SignIn; removed: string[] }> => {
    const team = await lockTeam(tx, teamId.data);
    if (!team) return { error: "הקבוצה לא נמצאה" };
    if (await isBlocked(tx, email.data)) return { error: "הכתובת החדשה חסומה. בטלו את החסימה קודם." };
    const members = await teamMembers(tx, team.id);
    const [newProfile] = await tx.select({ id: profiles.id }).from(profiles).where(sql`lower(${profiles.email}) = ${email.data}`);
    const removeIds = transferRemovals(members.map((m) => m.userId), mode, newProfile?.id ?? null);
    const removed = members.filter((m) => removeIds.includes(m.userId));
    if (removed.some((m) => m.isAdmin) && blockRemoved) return { error: "אחת הכתובות שיוסרו היא של מנהל. אי אפשר לחסום אותה." };

    if (removeIds.length > 0) {
      await tx.delete(memberships).where(and(eq(memberships.teamId, team.id), inArray(memberships.userId, removeIds)));
      for (const m of removed) {
        await tx.insert(auditLog).values({
          actorId: admin.id,
          entity: "membership",
          entityId: `${team.id}:${m.userId}`,
          action: "remove",
          before: { email: m.email, emailOff: m.emailOff, createdAt: m.createdAt, by: "admin", transfer: true },
        });
      }
    }
    if (mode === "replace") {
      await tx
        .update(teamInvitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(teamInvitations.teamId, team.id), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt)));
      await tx.delete(schema.cartItems).where(eq(schema.cartItems.teamId, team.id));
    }
    if (blockRemoved) await block(tx, admin.id, removed.map((m) => normalizeEmail(m.email)), `תפס/ה את ${team.program} ${team.number}`);

    const signIn = await addSignIn(tx, admin.id, team.id, email.data);
    await tx.update(teams).set({ contactEmail: email.data }).where(eq(teams.id, team.id));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team",
      entityId: team.id,
      action: "transfer",
      before: { emails: members.map((m) => m.email), contactEmail: team.contactEmail },
      after: { email: email.data, mode, removed: removed.map((m) => m.email), blocked: blockRemoved },
    });
    return { signIn, removed: removed.map((m) => m.email) };
  });
  if ("error" in result) return result;
  if (result.signIn.kind === "invited") {
    const { invitationId, link } = result.signIn;
    notifyLater(() => notifyInvite(teamId.data, invitationId, email.data, link));
  }
  refreshTeam(teamId.data);
  const removedText = result.removed.length > 0 ? ` ${blockRemoved ? "הוסרו ונחסמו" : "הוסרו"}: ${result.removed.join(", ")}.` : "";
  return { ok: `הקבוצה הועברה ל-${email.data}. ${signInMessage(result.signIn)}${removedText}` };
}

/**
 * "איחוד קבוצות": a team registered twice. The sign-ins, cart, orders, deliveries,
 * invitations, join requests and part requests of this team move into the chosen one,
 * then this team is deleted. The other team keeps its name, number and status.
 */
export async function mergeTeams(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const fromId = uuid.safeParse(formData.get("teamId"));
  const intoId = uuid.safeParse(formData.get("intoId"));
  if (!fromId.success) return { error: "הבקשה לא תקינה" };
  if (!intoId.success) return { error: "בחרו את הקבוצה שאליה מאחדים" };
  if (fromId.data === intoId.data) return { error: "אי אפשר לאחד קבוצה עם עצמה" };
  const from = fromId.data;
  const into = intoId.data;

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    // Both teams locked, in a fixed order, so two merges can't deadlock.
    const locked = await tx.select().from(teams).where(inArray(teams.id, [from, into])).orderBy(teams.id).for("update");
    const source = locked.find((t) => t.id === from);
    const target = locked.find((t) => t.id === into);
    if (!source || !target) return { error: "אחת הקבוצות לא נמצאה" };

    const moved = {
      members: (
        await tx.execute(sql`
          INSERT INTO memberships (team_id, user_id, email_off, created_at)
          SELECT ${into}, user_id, email_off, created_at FROM memberships WHERE team_id = ${from}
          ON CONFLICT DO NOTHING`)
      ).rowCount,
      cartLines: (
        await tx.execute(sql`
          INSERT INTO cart_items (team_id, variant_id, qty, added_by, created_at)
          SELECT ${into}, variant_id, qty, added_by, created_at FROM cart_items WHERE team_id = ${from}
          ON CONFLICT (team_id, variant_id) DO UPDATE SET qty = LEAST(cart_items.qty + excluded.qty, ${CART_MAX_QTY})`)
      ).rowCount,
      orders: (await tx.update(teamOrders).set({ teamId: into }).where(eq(teamOrders.teamId, from)).returning({ id: teamOrders.id })).length,
      deliveries: (await tx.update(deliveries).set({ teamId: into }).where(eq(deliveries.teamId, from)).returning({ id: deliveries.id })).length,
    };
    await tx.update(teamInvitations).set({ teamId: into }).where(eq(teamInvitations.teamId, from));
    // A join request for the other team from someone already on it, or already asking it, isn't moved.
    await tx.execute(sql`
      DELETE FROM team_join_requests WHERE team_id = ${from} AND (
        user_id IN (SELECT user_id FROM memberships WHERE team_id = ${into})
        OR user_id IN (SELECT user_id FROM team_join_requests WHERE team_id = ${into}))`);
    await tx.update(teamJoinRequests).set({ teamId: into }).where(eq(teamJoinRequests.teamId, from));
    await tx.update(partRequests).set({ teamId: into }).where(eq(partRequests.teamId, from));
    await tx.delete(teams).where(eq(teams.id, from));

    const snapshot = { fromId: source.id, fromName: source.name, fromNumber: `${source.program} ${source.number}`, fromStatus: source.status };
    await tx.insert(auditLog).values({ actorId: admin.id, entity: "team", entityId: into, action: "merge", after: { ...snapshot, moved } });
    await tx.insert(auditLog).values({ actorId: admin.id, entity: "team", entityId: from, action: "merged_into", before: source, after: { intoId: into, intoName: target.name, moved } });
    return {};
  });
  if (result.error) return result;
  refreshTeam(into);
  redirect(`/admin/teams/${into}`);
}

/** "השהיה" and "הפעלה מחדש". A suspended team can't send requests or approve quotes; it still sees its orders. */
export async function setTeamStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const teamId = uuid.safeParse(formData.get("teamId"));
  const change = z.enum(["suspend", "reactivate"]).safeParse(formData.get("change"));
  const reason = z.string().trim().max(500).safeParse(formData.get("reason") ?? "");
  if (!teamId.success || !change.success || !reason.success) return { error: "הבקשה לא תקינה" };

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const team = await lockTeam(tx, teamId.data);
    if (!team) return { error: "הקבוצה לא נמצאה" };
    const status = nextStatus(team.status, change.data);
    if (!status) return { error: "הסטטוס כבר השתנה. רעננו את הדף." };
    // The reason shows to the team on /pending, like a rejection's.
    const rejectionReason = change.data === "suspend" ? reason.data || null : null;
    await tx.update(teams).set({ status, rejectionReason, reviewedAt: new Date(), reviewedBy: admin.id }).where(eq(teams.id, team.id));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team",
      entityId: team.id,
      action: change.data,
      before: { status: team.status, rejectionReason: team.rejectionReason },
      after: { status, reason: rejectionReason },
    });
    return { ok: change.data === "suspend" ? "החשבון הושהה" : "החשבון פעיל" };
  });
  refreshTeam(teamId.data);
  return result;
}

/** What points at a user, for canDeleteUser. */
async function userFacts(tx: Tx, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { ordersSent: number; approvals: number }>();
  const orders = await tx.select({ userId: teamOrders.submittedBy, n: count() }).from(teamOrders).where(inArray(teamOrders.submittedBy, userIds)).groupBy(teamOrders.submittedBy);
  const approvals = await tx.select({ userId: quoteApprovals.userId, n: count() }).from(quoteApprovals).where(inArray(quoteApprovals.userId, userIds)).groupBy(quoteApprovals.userId);
  return new Map(
    userIds.map((id) => [id, { ordersSent: orders.find((o) => o.userId === id)?.n ?? 0, approvals: approvals.find((a) => a.userId === id)?.n ?? 0 }]),
  );
}

/**
 * Deletes sign-ins: the auth user, which takes its profile, memberships and join requests
 * with it (ON DELETE CASCADE); audit rows keep their text with no actor. The invitations
 * they sent go first, since those must name who sent them.
 */
async function deleteUsers(tx: Tx, userIds: string[]) {
  if (userIds.length === 0) return;
  await tx.delete(teamInvitations).where(inArray(teamInvitations.invitedBy, userIds));
  await tx.execute(sql`DELETE FROM auth.users WHERE id IN (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
}

/** Deletes a team that has no orders or deliveries (test data), and with `withUsers` its sign-ins that are on no other team. */
export async function deleteTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const teamId = uuid.safeParse(formData.get("teamId"));
  if (!teamId.success) return { error: "הבקשה לא תקינה" };
  const withUsers = formData.get("withUsers") === "on";

  let result: ActionState;
  try {
    result = await db.transaction(async (tx): Promise<ActionState> => {
      const team = await lockTeam(tx, teamId.data);
      if (!team) return { error: "הקבוצה כבר נמחקה" };
      const [orders] = await tx.select({ n: count() }).from(teamOrders).where(eq(teamOrders.teamId, team.id));
      const [delivered] = await tx.select({ n: count() }).from(deliveries).where(eq(deliveries.teamId, team.id));
      if (!canDeleteTeam({ orders: orders.n, deliveries: delivered.n })) {
        return { error: "לקבוצה יש הזמנות, אז היא לא נמחקת. אפשר להשהות אותה, או לאחד אותה לקבוצה אחרת." };
      }
      const members = await teamMembers(tx, team.id);
      const ids = members.map((m) => m.userId);
      const others = ids.length
        ? await tx
            .select({ userId: memberships.userId, n: count() })
            .from(memberships)
            .where(and(inArray(memberships.userId, ids), ne(memberships.teamId, team.id)))
            .groupBy(memberships.userId)
        : [];
      const facts = await userFacts(tx, ids);
      const userIds = withUsers
        ? usersToDeleteWithTeam(members.map((m) => ({ userId: m.userId, isAdmin: m.isAdmin, otherTeams: others.find((o) => o.userId === m.userId)?.n ?? 0, ...facts.get(m.userId)! })))
        : [];

      await tx.delete(teams).where(eq(teams.id, team.id));
      await deleteUsers(tx, userIds);
      await tx.insert(auditLog).values({
        actorId: admin.id,
        entity: "team",
        entityId: team.id,
        action: "delete",
        before: { ...team, emails: members.map((m) => m.email) },
        after: { deletedUsers: members.filter((m) => userIds.includes(m.userId)).map((m) => m.email) },
      });
      return {};
    });
  } catch (error) {
    console.error("[deleteTeam]", error);
    return { error: "המחיקה נכשלה, ושום דבר לא נמחק. נסו שוב, או מחקו את הקבוצה בלי המשתמשים." };
  }
  if (result.error) return result;
  refreshTeam();
  redirect("/admin/teams");
}

/** Deletes a sign-in that nothing of the business points at, e.g. a test account. Not the last sign-in of a team. */
export async function deleteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = uuid.safeParse(formData.get("userId"));
  if (!userId.success) return { error: "הבקשה לא תקינה" };
  if (userId.data === admin.id) return { error: "אי אפשר למחוק את עצמכם" };

  try {
    const result = await db.transaction(async (tx): Promise<ActionState> => {
      const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId.data)).for("update");
      if (!profile) return { error: "המשתמש כבר נמחק" };
      const facts = (await userFacts(tx, [profile.id])).get(profile.id)!;
      if (!canDeleteUser({ isAdmin: profile.isAdmin, ...facts })) {
        return { error: profile.isAdmin ? "זה מנהל. הסירו את ההרשאה קודם, ב״מנהלים״." : "המשתמש שלח בקשות או אישר הצעות, אז הוא לא נמחק. אפשר להסיר אותו מהקבוצה." };
      }
      const onlyOn = await tx.execute<{ name: string }>(sql`
        SELECT t.name FROM memberships m JOIN teams t ON t.id = m.team_id
        WHERE m.user_id = ${profile.id}
          AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.team_id = m.team_id AND o.user_id <> ${profile.id})`);
      if (onlyOn.rows.length > 0) return { error: `זאת הכתובת היחידה של ${onlyOn.rows.map((r) => `״${r.name}״`).join(", ")}. מחקו את הקבוצה, או הוסיפו לה כתובת קודם.` };

      await deleteUsers(tx, [profile.id]);
      await tx.insert(auditLog).values({ actorId: admin.id, entity: "profile", entityId: profile.id, action: "delete", before: { email: profile.email, fullName: profile.fullName } });
      return { ok: `${profile.email} נמחק` };
    });
    refreshTeam();
    return result;
  } catch (error) {
    console.error("[deleteUser]", error);
    return { error: "המחיקה נכשלה, ושום דבר לא נמחק." };
  }
}

/** Blocks an address from registering a team, asking to join one or accepting an invitation. */
export async function blockEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: "נא למלא כתובת דוא״ל תקינה" };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || null;
  const [profile] = await db.select({ isAdmin: profiles.isAdmin }).from(profiles).where(sql`lower(${profiles.email}) = ${email.data}`);
  if (profile?.isAdmin) return { error: "זאת כתובת של מנהל" };
  await db.transaction((tx) => block(tx, admin.id, [email.data], reason));
  refreshTeam();
  return { ok: `${email.data} חסומה. כתובות כניסה שכבר בקבוצות נשארות בהן: הסירו אותן מדף הקבוצה.` };
}

export async function unblockEmail(formData: FormData) {
  const admin = await requireAdmin();
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return;
  await db.transaction(async (tx) => {
    const [removed] = await tx.delete(blockedEmails).where(eq(blockedEmails.email, email.data)).returning();
    if (removed) await tx.insert(auditLog).values({ actorId: admin.id, entity: "blocked_email", entityId: email.data, action: "unblock", before: { email: removed.email, reason: removed.reason } });
  });
  refreshTeam();
}
