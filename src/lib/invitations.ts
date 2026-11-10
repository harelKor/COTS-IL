import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

const { auditLog, memberships, teamInvitations, teams } = schema;

export const newInviteToken = () => randomBytes(32).toString("base64url");
export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A usable invitation for a link's token, with its team. */
export async function findInvitation(token: string) {
  const [row] = await db
    .select({ invitation: teamInvitations, team: teams })
    .from(teamInvitations)
    .innerJoin(teams, eq(teams.id, teamInvitations.teamId))
    .where(
      and(
        eq(teamInvitations.tokenHash, hashInviteToken(token)),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
        gt(teamInvitations.expiresAt, new Date()),
        eq(teams.status, "active"),
      ),
    );
  return row ?? null;
}

/**
 * Joins a user to every team that invited their email. Callers must already know
 * the user owns the address: Supabase only signs in confirmed emails.
 */
export async function acceptInvitationsForUser(userId: string, email: string) {
  await db.transaction(async (tx) => {
    const pending = await tx
      .select({ invitation: teamInvitations })
      .from(teamInvitations)
      .innerJoin(teams, and(eq(teams.id, teamInvitations.teamId), eq(teams.status, "active")))
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
