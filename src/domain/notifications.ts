import type { OrderStatusKey } from "./order-status";

/**
 * Who hears about what (S3). Pure: the server side (src/lib/notify.ts) loads the team's
 * sign-in emails and the admins, and this decides who gets each email.
 *
 * D11: every email on the team account is equal, so the team side is "every sign-in
 * email of the team", minus the ones that turned that kind of email off.
 */

export type NotifyEvent =
  /** A team sent a quote request: the team gets a copy, the admin gets a new-request alert. */
  | "request_received"
  /** A new team signed up and waits for approval. */
  | "team_signed_up"
  /** Someone asked to join a registered team (S2's "בקשת הצטרפות"). */
  | "join_request"
  /** The admin sent a quote: each team email gets its own signed approve link. */
  | "quote_ready"
  | "quote_approved"
  | "quote_rejected"
  | "order_cancelled"
  /** The team asked for a change to the quote (S8): the order stays open. */
  | "change_requested"
  /** Someone opened an expired approve link and asked for a new one (S8). */
  | "link_requested"
  /** A sign-in email was added to a team: the new address gets its join link. */
  | "invite"
  /** The order reached a stage the team hears about (see STAGE_OF). */
  | "stage"
  /** A quote has waited for the team more than REMINDER_AFTER_DAYS. Sent once. */
  | "quote_reminder"
  /** The admin's daily list of what waits too long. */
  | "admin_digest";

/** The kinds of email a team address can turn off on /team. The rest can't be turned off. */
export const EMAIL_GROUPS = ["progress", "reminders"] as const;
export type EmailGroup = (typeof EMAIL_GROUPS)[number];

export const EMAIL_GROUP_LABELS: Record<EmailGroup, string> = {
  progress: "עדכוני התקדמות ההזמנה (הוזמנה, הגיעה, מוכנה, נמסרה)",
  reminders: "תזכורת על הצעה שמחכה לאישור",
};

export type Audience = "team" | "admin";

const AUDIENCE: Record<NotifyEvent, { team: EmailGroup | "always" | null; admin: boolean }> = {
  request_received: { team: "always", admin: true },
  team_signed_up: { team: null, admin: true },
  join_request: { team: "always", admin: true },
  quote_ready: { team: "always", admin: false },
  quote_approved: { team: null, admin: true },
  quote_rejected: { team: null, admin: true },
  order_cancelled: { team: null, admin: true },
  change_requested: { team: null, admin: true },
  link_requested: { team: null, admin: true },
  invite: { team: null, admin: false },
  stage: { team: "progress", admin: false },
  quote_reminder: { team: "reminders", admin: false },
  admin_digest: { team: null, admin: true },
};

/** Every email event with the audiences that get it, for the admin's list of email templates (M6). An event nobody is listed for (the invite) goes straight to a team address. */
export function emailAudiences(): { event: NotifyEvent; audiences: Audience[] }[] {
  return (Object.keys(AUDIENCE) as NotifyEvent[]).map((event) => {
    const rule = AUDIENCE[event];
    const audiences: Audience[] = [...(rule.team ? (["team"] as const) : []), ...(rule.admin ? (["admin"] as const) : [])];
    return { event, audiences: audiences.length > 0 ? audiences : ["team"] };
  });
}

export type TeamAddress = { userId: string; email: string; emailOff: readonly string[] };
export type AdminAddress = { userId: string; email: string };
export type Recipient = { userId: string; email: string; audience: Audience };

/** Each address once per audience; an admin who is also on the team gets both emails. */
export function recipientsFor(
  event: NotifyEvent,
  /** `adminsOff`: the admins who chose to get no email (M6, מנהלים); everyone else gets everything. */
  people: { team: TeamAddress[]; admins: AdminAddress[]; adminsOff?: readonly string[] },
): Recipient[] {
  const rule = AUDIENCE[event];
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const add = (r: Recipient) => {
    const email = r.email.trim().toLowerCase();
    const key = `${r.audience}:${email}`;
    if (!email.includes("@") || seen.has(key)) return;
    seen.add(key);
    out.push({ ...r, email });
  };
  if (rule.team) {
    for (const m of people.team) {
      if (rule.team !== "always" && m.emailOff.includes(rule.team)) continue;
      add({ userId: m.userId, email: m.email, audience: "team" });
    }
  }
  if (rule.admin) for (const a of people.admins) if (!people.adminsOff?.includes(a.userId)) add({ userId: a.userId, email: a.email, audience: "admin" });
  return out;
}

/** The stages a team hears about, in order. */
export const STAGES = ["ordered", "arrived", "ready", "delivered"] as const;
export type Stage = (typeof STAGES)[number];

/** From the one order status (src/domain/order-status.ts) to the email it earns, if any. */
export const STAGE_OF: Partial<Record<OrderStatusKey, Stage>> = {
  ordered: "ordered",
  to_warehouse: "ordered",
  at_warehouse: "arrived",
  to_team: "ready",
  delivered: "delivered",
};

/**
 * The stage email an order is due, or null. An order that jumped several stages at once
 * gets only the latest one, and a stage is never sent twice, nor one behind a sent one.
 */
export function stageDue(status: OrderStatusKey, sent: readonly Stage[]): Stage | null {
  const stage = STAGE_OF[status];
  if (!stage) return null;
  const at = STAGES.indexOf(stage);
  return sent.some((s) => STAGES.indexOf(s) >= at) ? null : stage;
}

/** Days a quote waits before its one reminder, until the admin sets another (תוכן האתר, מיילים). */
export const REMINDER_AFTER_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

/** One reminder per quote version, once it has waited more than `afterDays` (three by default). */
export function reminderDue(sentAt: Date, alreadyReminded: boolean, now = new Date(), afterDays = REMINDER_AFTER_DAYS): boolean {
  return !alreadyReminded && now.getTime() - sentAt.getTime() > afterDays * DAY;
}

/** The admin digest lists requests without a quote for longer than this. */
export const DIGEST_AFTER_HOURS = 24;

export function waitingTooLong(since: Date, now = new Date(), hours = DIGEST_AFTER_HOURS): boolean {
  return now.getTime() - since.getTime() > hours * 60 * 60 * 1000;
}

/** Sending is on only when both variables are set; without them the app works the same and sends nothing. */
export function emailConfig(env: Record<string, string | undefined>): { apiKey: string; from: string } | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** The /team form's checkboxes back into the stored list of groups turned off. */
export function emailOffFromForm(checkedOn: readonly string[]): EmailGroup[] {
  return EMAIL_GROUPS.filter((g) => !checkedOn.includes(g));
}
