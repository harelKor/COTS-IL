/** A team can't remove its last sign-in email, or nobody could sign in for it. */
export function wouldLeaveNoMembers(memberIds: string[], removedId: string): boolean {
  return !memberIds.some((id) => id !== removedId);
}

/** Days a join link lasts, until the admin sets another (תוכן האתר, מיילים). */
export const INVITE_DAYS = 14;

export function inviteExpiry(now: Date, days = INVITE_DAYS): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** How long a join link lasts, as the invite email says it: "לשבועיים", "לשבוע", "ל-10 ימים". */
export function inviteLasts(days: number): string {
  if (days === 14) return "לשבועיים";
  if (days === 7) return "לשבוע";
  if (days === 1) return "ליום";
  return `ל-${days} ימים`;
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

const letters = (value: string) => value.match(/\p{L}/gu) ?? [];

/** One character typed over and over ("ttt", "fff", "....") is a keyboard test, not a name. */
function isRepeatedChar(value: string): boolean {
  const chars = value.replace(/\s/g, "");
  return chars.length > 1 && new Set(chars.toLowerCase()).size === 1;
}

/** A team name: at least 3 characters, at least 2 of them letters, not one character repeated. Digits ("3D Robotics") are fine. */
export function isTeamName(value: string): boolean {
  const text = value.trim();
  return text.length >= 3 && letters(text).length >= 2 && !isRepeatedChar(text);
}

/** A person's name: at least 2 letters, only letters, spaces and the marks names carry (' ’ ׳ " ״ - .), not one letter repeated. */
export function isPersonName(value: string): boolean {
  const text = value.trim();
  if (letters(text).length < 2 || isRepeatedChar(text)) return false;
  return /^[\p{L}\p{M}\s'’׳"״.\-]+$/u.test(text);
}

export const TEAM_NAME_ERROR = "נא למלא את שם הקבוצה (לפחות 3 תווים, עם אותיות)";
export const PERSON_NAME_ERROR = "נא למלא שם מלא של איש קשר, באותיות";

/** FIRST's public team page, the one an admin checks before approving a team. */
export function firstTeamUrl(program: string, number: number): string {
  const host = program === "FTC" ? "ftc-events.firstinspires.org" : "frc-events.firstinspires.org";
  return `https://${host}/team/${number}`;
}
