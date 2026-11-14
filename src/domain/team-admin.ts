import { z } from "zod";
import { isPersonName, isPhone, isTeamName, parseTeamNumber, PERSON_NAME_ERROR, TEAM_NAME_ERROR } from "./teams";

/**
 * The admin's team management (M4): editing a team, its sign-in emails, moving a team
 * number to the right people, merging duplicates, suspending and deleting test data.
 * Pure rules here; the actions are in src/app/admin/teams/actions.ts.
 */

export type TeamStatus = "pending" | "active" | "rejected" | "suspended";

/** Tones match StatusTag's in src/components/form.tsx. */
export const TEAM_STATUS: Record<TeamStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  pending: { label: "ממתינה לאישור", tone: "warning" },
  active: { label: "פעילה", tone: "success" },
  rejected: { label: "נדחתה", tone: "danger" },
  suspended: { label: "מושהית", tone: "neutral" },
};

/**
 * Whether a team may send a quote request. An approved team may; a new one waiting for
 * approval only while the business setting allows it (`pendingTeamsMaySend`, default yes).
 * Rejected and suspended teams never may, but they still see their orders.
 */
export function teamCanSend(status: TeamStatus, pendingTeamsMaySend: boolean): boolean {
  return status === "active" || (status === "pending" && pendingTeamsMaySend);
}

/** The status changes the admin makes from the team page, beyond approve/reject (reviewTeam). */
export type StatusChange = "suspend" | "reactivate";

/** The status a change leads to, or null when it doesn't apply to the team's status now. */
export function nextStatus(status: TeamStatus, change: StatusChange): TeamStatus | null {
  if (change === "suspend") return status === "active" || status === "pending" ? "suspended" : null;
  return status === "suspended" || status === "rejected" ? "active" : null;
}

/** Orders and deliveries keep a team's history: a team with any of them is merged or suspended, never deleted. */
export function canDeleteTeam(counts: { orders: number; deliveries: number }): boolean {
  return counts.orders === 0 && counts.deliveries === 0;
}

/**
 * A sign-in (auth user) can be deleted only when nothing of the business points at it:
 * not an admin, no request it sent, no quote it approved. Teams it's on stay.
 */
export function canDeleteUser(user: { isAdmin: boolean; ordersSent: number; approvals: number }): boolean {
  return !user.isAdmin && user.ordersSent === 0 && user.approvals === 0;
}

/** The users a team's delete takes along when asked: on no other team, and deletable. */
export function usersToDeleteWithTeam(
  members: { userId: string; isAdmin: boolean; otherTeams: number; ordersSent: number; approvals: number }[],
): string[] {
  return members.filter((m) => m.otherTeams === 0 && canDeleteUser(m)).map((m) => m.userId);
}

/** Matches MAX_QTY in src/app/cart/actions.ts: two carts merged never pass it. */
export const CART_MAX_QTY = 9999;

/** A part in both carts of a merge: the quantities add up, to the cart's limit. */
export function mergedQty(a: number, b: number): number {
  return Math.min(a + b, CART_MAX_QTY);
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Moving a team number to the right people. "replace" takes every current sign-in off
 * (the wrong claimant), "add" keeps them. The new address joins in both cases, so the
 * team isn't left with nobody unless the new address still has to sign in (then its
 * invitation waits for it). Returns the user ids to take off.
 */
export function transferRemovals(memberIds: string[], mode: "replace" | "add", newUserId: string | null): string[] {
  return mode === "replace" ? memberIds.filter((id) => id !== newUserId) : [];
}

const optional = (max: number) => z.string().trim().max(max).default("");

/** The admin's edit of a team: the team's own form (updateTeamDetails) plus the programme and the number. */
export const adminTeamSchema = z.object({
  name: z.string().trim().max(100).refine(isTeamName, TEAM_NAME_ERROR),
  program: z.enum(["FRC", "FTC"]),
  number: z.unknown().transform((v, ctx) => parseTeamNumber(v) ?? (ctx.addIssue({ code: "custom", message: "מספר קבוצה לא תקין" }), z.NEVER)),
  contactName: optional(100).refine((v) => v === "" || isPersonName(v), PERSON_NAME_ERROR),
  contactPhone: optional(20).refine((v) => v === "" || isPhone(v), "מספר טלפון לא תקין"),
  contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("כתובת דוא״ל לא תקינה"))]).default(""),
  address: optional(500),
});
export type AdminTeamInput = z.infer<typeof adminTeamSchema>;

/** The form to the row's values, blanks as null; or the first error to show. */
export function parseAdminTeam(input: Record<string, unknown>):
  | { ok: true; value: { name: string; program: "FRC" | "FTC"; number: number; contactName: string | null; contactPhone: string | null; contactEmail: string | null; address: string | null } }
  | { ok: false; error: string } {
  const parsed = adminTeamSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "יש שדה לא תקין" };
  const v = parsed.data;
  return {
    ok: true,
    value: {
      name: v.name,
      program: v.program,
      number: v.number,
      contactName: v.contactName || null,
      contactPhone: v.contactPhone || null,
      contactEmail: v.contactEmail || null,
      address: v.address || null,
    },
  };
}

/** The fields that changed, for the audit log's before/after. */
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (before[key] !== after[key]) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}

export type HistoryEntry = {
  entity: string;
  action: string;
  before: unknown;
  after: unknown;
};

const field = (value: unknown, key: string): string | null => {
  if (!value || typeof value !== "object") return null;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
};

/** One line of a team's action history, in Hebrew, from an audit_log row. Unknown rows still read sensibly. */
export function historyText(entry: HistoryEntry): string {
  const email = field(entry.after, "email") ?? field(entry.before, "email");
  const withEmail = (text: string) => (email ? `${text}: ${email}` : text);
  switch (`${entry.entity}:${entry.action}`) {
    case "team:approve":
      return "הקבוצה אושרה";
    case "team:reject":
      return field(entry.after, "rejectionReason") ? `הקבוצה נדחתה: ${field(entry.after, "rejectionReason")}` : "הקבוצה נדחתה";
    case "team:suspend":
      return field(entry.after, "reason") ? `החשבון הושהה: ${field(entry.after, "reason")}` : "החשבון הושהה";
    case "team:reactivate":
      return "החשבון הופעל מחדש";
    case "team:update_details":
      return "פרטי הקבוצה עודכנו (מחשבון הקבוצה)";
    case "team:admin_update":
      return "פרטי הקבוצה עודכנו (מנהל)";
    case "team:transfer":
      return withEmail("מספר הקבוצה הועבר");
    case "team:merge":
      return `אוחדה לתוכה קבוצה כפולה${field(entry.after, "fromName") ? `: ${field(entry.after, "fromName")}` : ""}`;
    case "membership:add":
      return withEmail("נוספה כתובת כניסה");
    case "membership:remove":
      return withEmail("הוסרה כתובת כניסה");
    case "membership:restore":
      return withEmail("כתובת כניסה הוחזרה");
    case "membership:email_preferences":
      return "הגדרות המיילים של כתובת עודכנו";
    case "team_invitation:create":
      return withEmail("נשלחה הזמנה");
    case "team_invitation:accept":
      return "הזמנה התקבלה";
    case "team_invitation:revoke":
      return withEmail("הזמנה בוטלה");
    case "team_join_request:create":
      return "התקבלה בקשת הצטרפות";
    case "team_join_request:accept":
      return withEmail("בקשת הצטרפות אושרה");
    case "team_join_request:decline":
      return withEmail("בקשת הצטרפות נדחתה");
    default:
      return `${entry.entity}: ${entry.action}`;
  }
}
