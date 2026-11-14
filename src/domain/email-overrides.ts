import type { Audience, NotifyEvent } from "./notifications";
import { formatIls } from "./pricing";

/**
 * The admin's own wording for the emails (M6). A template is an optional subject and body for one
 * event and audience; an empty one keeps the built-in text (src/lib/email-templates.ts). The body
 * replaces the message paragraphs only: the heading, the lines table, the button and the footer
 * stay. Text can use `{tokens}`: the event's own (the order number, the team, the total) and a few
 * business facts. Pure, so tests cover the filling.
 */

export type EmailTemplate = { subject: string | null; body: string | null };

/** The key a template is stored under in content.emails.templates. */
export const templateKey = (event: NotifyEvent, audience: Audience) => `${event}:${audience}`;

/** What the admin sees for each event; an event added later without a name here shows its key. */
export const EVENT_LABELS: Partial<Record<NotifyEvent, string>> = {
  request_received: "בקשה התקבלה",
  team_signed_up: "קבוצה חדשה נרשמה",
  join_request: "בקשת הצטרפות לקבוצה",
  quote_ready: "הצעת מחיר מוכנה",
  quote_approved: "הצעה אושרה",
  quote_rejected: "הצעה נדחתה",
  order_cancelled: "הזמנה בוטלה",
  change_requested: "בקשת שינוי בהצעה",
  link_requested: "בקשה לקישור אישור חדש",
  invite: "הזמנה להצטרף לקבוצה",
  stage: "עדכון שלב בהזמנה",
  quote_reminder: "תזכורת על הצעה",
  admin_digest: "סיכום יומי למנהלים",
};

export const AUDIENCE_LABELS: Record<Audience, string> = { team: "לקבוצה", admin: "למנהלים" };

export const eventLabel = (event: NotifyEvent) => EVENT_LABELS[event] ?? event;

/** A token's value; `ltr` values (numbers, addresses) are set left-to-right inside the Hebrew. */
export type TokenValue = { value: string; ltr?: boolean };
export type TokenValues = Record<string, TokenValue>;

/** The fields of an email's data that become tokens. */
const FIELD_TOKENS: Record<string, { token: string; ltr?: boolean; money?: boolean }> = {
  orderNumber: { token: "מספר הזמנה", ltr: true },
  teamName: { token: "קבוצה" },
  totalIls: { token: "סכום", money: true },
  email: { token: "דוא״ל", ltr: true },
  name: { token: "שם" },
  contactName: { token: "שם" },
  reason: { token: "סיבה" },
  linkDays: { token: "ימים", ltr: true },
  days: { token: "ימים", ltr: true },
  quoteDays: { token: "ימי עסקים", ltr: true },
};

/** The tokens one event's data offers, plus any `extra` the template adds (e.g. the stage's name). */
export function eventTokens(data: object, extra: TokenValues = {}): TokenValues {
  const out: TokenValues = {};
  for (const [field, value] of Object.entries(data)) {
    const spec = FIELD_TOKENS[field];
    if (!spec || value === null || value === undefined || value === "") continue;
    const text = spec.money && typeof value === "number" ? formatIls(value) : String(value);
    out[spec.token] = { value: text, ltr: spec.ltr };
  }
  return { ...out, ...extra };
}

/** The business facts every email can quote; an unset one is empty. */
export function factTokens(business: {
  legalName: string | null;
  phone: string | null;
  email: string | null;
  handlingFee: string | null;
  paymentTerms: string | null;
  returnPolicy: string | null;
}): TokenValues {
  return {
    "שם העסק": { value: business.legalName ?? "" },
    "טלפון העסק": { value: business.phone ?? "", ltr: true },
    "דוא״ל העסק": { value: business.email ?? "", ltr: true },
    "דמי טיפול": { value: business.handlingFee ?? "" },
    "תנאי תשלום": { value: business.paymentTerms ?? "" },
    "מדיניות החזרות": { value: business.returnPolicy ?? "" },
  };
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const TOKEN = /\{([^{}]+)\}/g;

/** Plain text: `{name}` replaced by its value, an unknown or unset name by nothing. */
export function fillText(text: string, values: TokenValues): string {
  return text.replace(TOKEN, (_, name: string) => values[name.trim()]?.value ?? "");
}

/** HTML: the literal text and each value escaped, left-to-right values isolated. */
export function fillHtml(text: string, values: TokenValues): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    out += escapeHtml(text.slice(last, m.index));
    const v = values[m[1].trim()];
    if (v && v.value) out += v.ltr ? `<bdi dir="ltr" style="unicode-bidi:isolate">${escapeHtml(v.value)}</bdi>` : escapeHtml(v.value);
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

const hasWords = (s: string) => /[\p{L}\p{N}]/u.test(s);

/** The subject with its tokens filled, one line; null when it ends up empty (the built-in subject is used). */
export function subjectFrom(template: string | null | undefined, values: TokenValues): string | null {
  if (!template) return null;
  const subject = fillText(template, values).replace(/\s+/g, " ").trim();
  return hasWords(subject) ? subject : null;
}

/**
 * The body's paragraphs (a blank line starts one; a line break inside one stays), as HTML and as
 * plain text. A paragraph left with no letters or digits once its tokens are filled is dropped.
 * Null when nothing is left (the built-in message is used).
 */
export function bodyFrom(template: string | null | undefined, values: TokenValues): { html: string[]; text: string[] } | null {
  if (!template) return null;
  const paragraphs = template
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => hasWords(fillText(p, values)));
  if (paragraphs.length === 0) return null;
  return {
    html: paragraphs.map((p) => p.split("\n").map((line) => fillHtml(line.trim(), values)).join("<br>")),
    text: paragraphs.map((p) => p.split("\n").map((line) => fillText(line.trim(), values)).join("\n")),
  };
}

/** Names in `text` that no token offers, for the editor's warning. */
export function unknownEmailTokens(text: string, known: readonly string[]): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((m) => m[1].trim()).filter((n) => !known.includes(n)))];
}
