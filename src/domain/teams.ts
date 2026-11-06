import type { TeamRole } from "./orders";

export const ROLE_LABELS: Record<TeamRole, string> = {
  team_admin: "מנטור/ית",
  buyer: "סטודנט/ית",
  viewer: "צופה",
};

export const canManageTeam = (role: TeamRole) => role === "team_admin";

/** Every team needs a team admin, since only they can approve quotes and manage members. */
export function wouldLeaveNoAdmin(
  members: { userId: string; role: TeamRole }[],
  userId: string,
  newRole: TeamRole | null,
): boolean {
  if (newRole === "team_admin") return false;
  return !members.some((m) => m.role === "team_admin" && m.userId !== userId);
}

export const INVITE_DAYS = 14;

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}
