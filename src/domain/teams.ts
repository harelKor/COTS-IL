/** A team can't remove its last sign-in email, or nobody could sign in for it. */
export function wouldLeaveNoMembers(memberIds: string[], removedId: string): boolean {
  return !memberIds.some((id) => id !== removedId);
}

export const INVITE_DAYS = 14;

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

/** FRC and FTC numbers both stay well under this; one limit for every form and the lookup API. */
export const TEAM_NUMBER_MAX = 99999;

/** A team number typed by a person: whole, 1 to TEAM_NUMBER_MAX, digits only. Null when it isn't one. */
export function parseTeamNumber(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,5}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= TEAM_NUMBER_MAX ? n : null;
}

/** An Israeli or international phone a person can call: digits with optional +, spaces, dashes, brackets; 9 to 15 digits. */
export function isPhone(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\+?[0-9()\- ]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "").length;
  return digits >= 9 && digits <= 15;
}
