/** A team can't remove its last sign-in email, or nobody could sign in for it. */
export function wouldLeaveNoMembers(memberIds: string[], removedId: string): boolean {
  return !memberIds.some((id) => id !== removedId);
}

export const INVITE_DAYS = 14;

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}
