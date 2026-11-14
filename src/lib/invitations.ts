import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNull, or, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

const { auditLog, blockedEmails, memberships, teamInvitations, teams } = schema;

/** M4: an address the admin blocked can't register a team, ask to join one or accept an invitation. */
export async function isEmailBlocked(email: string): Promise<boolean> {
  const [row] = await db.select({ email: blockedEmails.email }).from(blockedEmails).where(eq(blockedEmails.email, email.trim().toLowerCase()));
  return !!row;
}

export const BLOCKED_EMAIL_ERROR = "הכתובת הזאת לא יכולה להירשם לקבוצה. לשאלות פנו אלינו.";

export const newInviteToken = () => randomBytes(32).toString("base64url");
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Teams that can take in sign-in emails: approved ones, and new ones still waiting for approval. */
const OPEN_TEAM = inArray(teams.status, ["active", "pending"]);

/**
 * An invitation for a link's token, with its team: a usable one, or one already
 * accepted (so the page can say "you joined" instead of "invalid").
 */
export async function findInvitation(token: string) {
  const [row] = await db
    .select({ invitation: teamInvitations, team: teams })
    .from(teamInvitations)
    .innerJoin(teams, eq(teams.id, teamInvitations.teamId))
    .where(
      and(
        eq(teamInvitations.tokenHash, hashInviteToken(token)),
        isNull(teamInvitations.revokedAt),
        or(isNotNull(teamInvitations.acceptedAt), gt(teamInvitations.expiresAt, new Date())),
        OPEN_TEAM,
      ),
    );
  return row ?? null;
}

/**
 * Joins a user to every team that invited their email. Callers must already know
 * the user owns the address: Supabase only signs in confirmed emails.
 */
export async function acceptInvitationsForUser(userId: string, email: string) {
  if (await isEmailBlocked(email)) return;
  await db.transaction(async (tx) => {
    const pending = await tx
      .select({ invitation: teamInvitations })
      .from(teamInvitations)
      .innerJoin(teams, and(eq(teams.id, teamInvitations.teamId), OPEN_TEAM))
      .where(
        and(
          eq(teamInvitations.email, email.toLowerCase()),
          isNull(teamInvitations.acceptedAt),
          isNull(teamInvitations.revokedAt),
          gt(teamInvitations.expiresAt, new Date()),
        ),
      )
      .for("update", { of: teamInvitations });

    for (const { invitation } of pending) {
      await tx
        .insert(memberships)
        .values({ teamId: invitation.teamId, userId })
        .onConflictDoNothing();
      await tx.update(teamInvitations).set({ acceptedAt: new Date() }).where(eq(teamInvitations.id, invitation.id));
      await tx.insert(auditLog).values({
        actorId: userId,
        entity: "team_invitation",
        entityId: invitation.id,
        action: "accept",
        after: { teamId: invitation.teamId },
      });
    }
  });
}
