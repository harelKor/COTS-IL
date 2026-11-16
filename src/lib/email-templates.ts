import { bodyFrom, eventTokens, factTokens, subjectFrom, templateKey, type EmailTemplate, type TokenValues } from "@/domain/email-overrides";
import type { Audience, NotifyEvent, Stage } from "@/domain/notifications";
import { statusLabel, type OrderStatusKey } from "@/domain/order-status";
import { formatIls } from "@/domain/pricing";
import type { Business } from "@/domain/settings";
import { DEFAULT_TAGLINE } from "@/domain/site-text";
import { inviteLasts } from "@/domain/teams";

/**
 * The Hebrew, right-to-left emails (S3). Plain HTML strings with inline styles, because
 * mail apps ignore stylesheets: the brand header, one short message, one button, and
 * every part name, SKU and team number inside a left-to-right span. Pure, so tests render them.
 */

export type EmailLine = { title: string; sku: string | null; options?: string | null; qty: number; unitPriceIls: number | null };

export type EmailData = {
  request_received: { orderNumber: number; teamName: string; lines: EmailLine[]; totalIls: number; quoteDays: number | null; orderUrl: string; adminUrl: string };
  team_signed_up: { teamName: string; contactName: string | null; email: string; adminUrl: string };
  join_request: { teamName: string; email: string; name: string | null; teamUrl: string; adminUrl: string };
  quote_ready: { orderNumber: number; teamName: string; totalIls: number; approveUrl: string | null; orderUrl: string; linkDays: number };
  quote_approved: { orderNumber: number; teamName: string; totalIls: number; adminUrl: string };
  quote_rejected: { orderNumber: number; teamName: string; reason: string | null; adminUrl: string };
  order_cancelled: { orderNumber: number; teamName: string; adminUrl: string };
  change_requested: { orderNumber: number; teamName: string; reason: string | null; adminUrl: string };
  /** `days`: how long the link lasts (14 when missing). */
  invite: { teamName: string; url: string; days?: number };
  link_requested: { orderNumber: number; teamName: string; email: string; adminUrl: string };
  stage: { orderNumber: number; teamName: string; stage: Stage; pickup: boolean; orderUrl: string };
  quote_reminder: { orderNumber: number; teamName: string; days: number; approveUrl: string | null; orderUrl: string };
  admin_digest: { items: { orderNumber: number; teamName: string; hours: number; url: string }[]; adminUrl: string };
};

export type RenderedEmail = { subject: string; html: string; text: string };

const C = {
  bg: "#F6F9FF",
  surface: "#FFFFFF",
  text: "#0B1528",
  muted: "#52658A",
  line: "#D8E4FA",
  brand: "#1D4ED8",
  brandStrong: "#1E3A8A",
  tile: "#F2F7FF",
};

export function esc(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Part names, SKUs, emails and numbers keep their own direction inside the Hebrew text. */
const ltr = (value: string | number) => `<bdi dir="ltr" style="unicode-bidi:isolate">${esc(value)}</bdi>`;

/**
 * What the admin changed (M6): a template's subject and body, the business facts and the site
 * tagline. Set for the length of one renderEmail call (synchronous), so `layout` reads it and every
 * event, including ones added later, takes an override without its own code.
 */
type RenderContext = { template: EmailTemplate | null; values: TokenValues; tagline: string };
let context: RenderContext | null = null;

type Body = { subject: string; heading: string; paragraphs: string[]; table?: string; button?: { label: string; url: string }; after?: string[]; textLines: string[] };

function layout(b: Body): RenderedEmail {
  const ctx = context;
  const subject = (ctx?.template && subjectFrom(ctx.template.subject, ctx.values)) || b.subject;
  const custom = ctx?.template ? bodyFrom(ctx.template.body, ctx.values) : null;
  b = { ...b, subject, paragraphs: custom ? custom.html : b.paragraphs, textLines: custom ? custom.text : b.textLines };
  const p = (html: string) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:${C.text}">${html}</p>`;
  const button = b.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="border-radius:999px;background:${C.brand}"><a href="${esc(b.button.url)}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px">${esc(b.button.label)}</a></td></tr></table>`
    : "";
  const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div dir="rtl" style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,'Segoe UI',Heebo,Arial,sans-serif;text-align:right;direction:rtl">
<div style="margin-bottom:16px"><span style="display:inline-block;padding:6px 12px;border-radius:10px;background:${C.brand};color:#FFFFFF;font-weight:700;font-size:16px">${ltr("BLUEHUB")}</span> <span style="font-size:13px;color:${C.muted}">${ltr("FRC / FTC")}</span></div>
<div style="background:${C.surface};border:1px solid ${C.line};border-radius:18px;padding:24px">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${C.brandStrong}">${b.heading}</h1>
${b.paragraphs.map(p).join("\n")}
${b.table ?? ""}
${button}
${(b.after ?? []).map((t) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${C.muted}">${t}</p>`).join("\n")}
</div>
<p style="margin:16px 0 0;font-size:13px;color:${C.muted}">${ltr("BLUEHUB")}, ${esc(ctx?.tagline ?? DEFAULT_TAGLINE)}.</p>
</div></body></html>`;
  const text = [...b.textLines, ...(b.button ? [`${b.button.label}: ${b.button.url}`] : [])].join("\n\n");
  return { subject: b.subject, html, text };
}

function linesTable(lines: EmailLine[], totalIls: number | null) {
  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;border-top:1px solid ${C.line};font-size:14px;color:${C.text}">${ltr(l.title)}<br><span style="font-size:13px;color:${C.muted}">${[l.sku, l.options].filter(Boolean).map((v) => ltr(v!)).join(", ")}</span></td>` +
        `<td style="padding:8px 8px;border-top:1px solid ${C.line};font-size:14px;color:${C.text};white-space:nowrap">× ${ltr(l.qty)}</td>` +
        `<td style="padding:8px 0;border-top:1px solid ${C.line};font-size:14px;color:${C.text};white-space:nowrap;text-align:left">${l.unitPriceIls === null ? "" : esc(formatIls(l.unitPriceIls * l.qty))}</td></tr>`,
    )
    .join("");
  const total =
    totalIls === null
      ? ""
      : `<tr><td colspan="2" style="padding:10px 0;border-top:1px solid ${C.line};font-size:15px;font-weight:600">סה״כ לפי מחירי הקטלוג</td><td style="padding:10px 0;border-top:1px solid ${C.line};font-size:15px;font-weight:600;text-align:left;white-space:nowrap">${esc(formatIls(totalIls))}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-collapse:collapse;background:${C.tile};border-radius:12px">${rows}${total}</table>`;
}

/** The order status each stage email announces: its words come from the status dictionary (T4). */
const STAGE_STATUS: Record<Stage, OrderStatusKey> = { ordered: "ordered", arrived: "at_warehouse", ready: "to_team", delivered: "delivered" };

const STAGE_BODY: Record<Stage, (pickup: boolean) => string> = {
  ordered: () => "הזמנו את החלקים מהספקים בארה״ב. נעדכן כשהם יגיעו לישראל.",
  arrived: (pickup) => `החלקים הגיעו ונבדקו. נעדכן כשההזמנה תהיה ${pickup ? "מוכנה לאיסוף" : "מוכנה למשלוח אליכם"}.`,
  ready: (pickup) => (pickup ? "אפשר לבוא לאסוף." : "ההזמנה יוצאת אליכם במשלוח."),
  delivered: () => "בהצלחה בעונה!",
};

/** The tokens a template of `event` can use, with their values for this `data`: the event's own, the stage's name and message, and the business facts. */
export function tokenValuesFor(event: NotifyEvent, data: EmailData[NotifyEvent], facts: TokenValues = {}): TokenValues {
  const extra: TokenValues = { ...facts };
  if (event === "stage") {
    const x = data as EmailData["stage"];
    extra["סטטוס"] = { value: statusLabel(STAGE_STATUS[x.stage], "team", x.pickup) };
    extra["הודעת השלב"] = { value: STAGE_BODY[x.stage](x.pickup) };
  }
  return eventTokens(data, extra);
}

export type RenderOptions = { template?: EmailTemplate | null; facts?: TokenValues; tagline?: string };

/** The options for one email from the admin's settings: its template, the business facts and the tagline. */
export function renderOptions(
  settings: { business: Business; content: { tagline: string; emails: { templates: Record<string, EmailTemplate> } } },
  event: NotifyEvent,
  audience: Audience,
): RenderOptions {
  return { template: settings.content.emails.templates[templateKey(event, audience)] ?? null, facts: factTokens(settings.business), tagline: settings.content.tagline };
}

/**
 * One email for one audience, in the admin's words where they set any (`options`). `request_received`
 * reads differently for the team and the admin.
 */
export function renderEmail<E extends NotifyEvent>(event: E, audience: Audience, data: EmailData[E], options: RenderOptions = {}): RenderedEmail {
  context = { template: options.template ?? null, values: tokenValuesFor(event, data, options.facts), tagline: options.tagline ?? DEFAULT_TAGLINE };
  try {
    return buildEmail(event, audience, data);
  } finally {
    context = null;
  }
}

/** One email for one audience, built-in text. */
function buildEmail<E extends NotifyEvent>(event: E, audience: Audience, data: EmailData[E]): RenderedEmail {
  const d = data as EmailData[NotifyEvent];
  switch (event) {
    case "request_received": {
      const x = d as EmailData["request_received"];
      if (audience === "admin") {
        return layout({
          subject: `בקשה חדשה ${x.orderNumber} מ${x.teamName}`,
          heading: `בקשה חדשה מ${esc(x.teamName)}`,
          paragraphs: [`בקשה ${ltr(x.orderNumber)}: ${ltr(x.lines.length)} שורות, ${esc(formatIls(x.totalIls))} לפי מחירי הקטלוג.`],
          table: linesTable(x.lines, x.totalIls),
          button: { label: "פתיחת ההזמנה", url: x.adminUrl },
          textLines: [`בקשה חדשה ${x.orderNumber} מ${x.teamName}: ${x.lines.length} שורות, ${formatIls(x.totalIls)}.`],
        });
      }
      const eta = x.quoteDays ? `הצעת מחיר תגיע תוך ${ltr(x.quoteDays)} ימי עסקים.` : "נשלח לכם הצעת מחיר בדוא״ל כשהיא תהיה מוכנה.";
      return layout({
        subject: `קיבלנו את הבקשה ${x.orderNumber}`,
        heading: "קיבלנו את בקשת הצעת המחיר",
        paragraphs: [`בקשה ${ltr(x.orderNumber)} של ${esc(x.teamName)} התקבלה. ${eta}`],
        table: linesTable(x.lines, x.totalIls),
        button: { label: "צפייה בבקשה", url: x.orderUrl },
        after: ["המחירים לפי הקטלוג ביום השליחה. המשלוח יתומחר בהצעה."],
        textLines: [`בקשה ${x.orderNumber} של ${x.teamName} התקבלה.`, ...x.lines.map((l) => `${l.title}${l.sku ? ` (${l.sku})` : ""} × ${l.qty}`), `סה״כ ${formatIls(x.totalIls)}`],
      });
    }
    case "team_signed_up": {
      const x = d as EmailData["team_signed_up"];
      return layout({
        subject: `קבוצה חדשה נרשמה: ${x.teamName}`,
        heading: "קבוצה חדשה מחכה לאישור",
        paragraphs: [`${esc(x.teamName)} נרשמה${x.contactName ? ` (איש/ת קשר: ${esc(x.contactName)})` : ""} מהכתובת ${ltr(x.email)}.`],
        button: { label: "אישור קבוצות", url: x.adminUrl },
        textLines: [`${x.teamName} נרשמה מהכתובת ${x.email}.`],
      });
    }
    case "join_request": {
      const x = d as EmailData["join_request"];
      const who = `${x.name ? `${esc(x.name)}, ` : ""}${ltr(x.email)}`;
      return audience === "admin"
        ? layout({
            subject: `בקשת הצטרפות ל${x.teamName}`,
            heading: "בקשת הצטרפות לקבוצה",
            paragraphs: [`${who} ביקש/ה להצטרף ל${esc(x.teamName)}. הקבוצה מאשרת בעמוד חשבון הקבוצה.`],
            button: { label: "הקבוצות", url: x.adminUrl },
            textLines: [`${x.email} ביקש/ה להצטרף ל${x.teamName}.`],
          })
        : layout({
            subject: `בקשת הצטרפות לחשבון ${x.teamName}`,
            heading: "מישהו מבקש להצטרף לחשבון הקבוצה",
            paragraphs: [`${who} ביקש/ה להצטרף לחשבון של ${esc(x.teamName)}. אפשר לאשר או לדחות בלחיצה אחת.`],
            button: { label: "לחשבון הקבוצה", url: x.teamUrl },
            textLines: [`${x.email} ביקש/ה להצטרף לחשבון של ${x.teamName}.`],
          });
    }
    case "quote_ready": {
      const x = d as EmailData["quote_ready"];
      return layout({
        subject: `הצעת המחיר להזמנה ${x.orderNumber} מוכנה`,
        heading: "הצעת המחיר מוכנה",
        paragraphs: [`הצעת המחיר להזמנה ${ltr(x.orderNumber)} של ${esc(x.teamName)}: ${esc(formatIls(x.totalIls))}, כולל משלוח.`],
        button: x.approveUrl ? { label: "צפייה ואישור", url: x.approveUrl } : { label: "צפייה בהצעה", url: x.orderUrl },
        after: x.approveUrl ? [`הקישור אישי, בתוקף ${ltr(x.linkDays)} ימים, ופותח את ההצעה לפני אישור. אפשר גם לאשר או לדחות מעמוד ההזמנה באתר.`] : [],
        textLines: [`הצעת המחיר להזמנה ${x.orderNumber} של ${x.teamName}: ${formatIls(x.totalIls)}, כולל משלוח.`],
      });
    }
    case "quote_approved": {
      const x = d as EmailData["quote_approved"];
      return layout({
        subject: `הצעה ${x.orderNumber} אושרה`,
        heading: `${esc(x.teamName)} אישרה את ההצעה`,
        paragraphs: [`הזמנה ${ltr(x.orderNumber)} אושרה, ${esc(formatIls(x.totalIls))}. אפשר להזמין מהספקים.`],
        button: { label: "פתיחת ההזמנה", url: x.adminUrl },
        textLines: [`${x.teamName} אישרה את הזמנה ${x.orderNumber}, ${formatIls(x.totalIls)}.`],
      });
    }
    case "quote_rejected": {
      const x = d as EmailData["quote_rejected"];
      return layout({
        subject: `הצעה ${x.orderNumber} נדחתה`,
        heading: `${esc(x.teamName)} דחתה את ההצעה`,
        paragraphs: [`הזמנה ${ltr(x.orderNumber)} נדחתה${x.reason ? `: ${esc(x.reason)}` : "."}`],
        button: { label: "פתיחת ההזמנה", url: x.adminUrl },
        textLines: [`${x.teamName} דחתה את הזמנה ${x.orderNumber}${x.reason ? `: ${x.reason}` : ""}.`],
      });
    }
    case "order_cancelled": {
      const x = d as EmailData["order_cancelled"];
      return layout({
        subject: `הזמנה ${x.orderNumber} בוטלה`,
        heading: `${esc(x.teamName)} ביטלה הזמנה`,
        paragraphs: [`הזמנה ${ltr(x.orderNumber)} בוטלה על ידי הקבוצה.`],
        button: { label: "פתיחת ההזמנה", url: x.adminUrl },
        textLines: [`${x.teamName} ביטלה את הזמנה ${x.orderNumber}.`],
      });
    }
    case "change_requested": {
      const x = d as EmailData["change_requested"];
      return layout({
        subject: `בקשת שינוי בהצעה ${x.orderNumber}`,
        heading: `${esc(x.teamName)} מבקשת שינוי בהצעה`,
        paragraphs: [`הזמנה ${ltr(x.orderNumber)} נשארת פתוחה${x.reason ? `. הבקשה: ${esc(x.reason)}` : "."}`, "אפשר לשלוח גרסה חדשה של ההצעה."],
        button: { label: "פתיחת ההזמנה", url: x.adminUrl },
        textLines: [`${x.teamName} מבקשת שינוי בהזמנה ${x.orderNumber}${x.reason ? `: ${x.reason}` : ""}.`],
      });
    }
    case "invite": {
      const x = d as EmailData["invite"];
      return layout({
        subject: `הוזמנתם לחשבון ${x.teamName} ב-BLUEHUB`,
        heading: `הצטרפות ל${esc(x.teamName)}`,
        paragraphs: ["הכתובת הזאת נוספה לחשבון הקבוצה ב-BLUEHUB. אחרי ההצטרפות אפשר לבנות סל, לשלוח בקשות ולאשר הצעות.", `הקישור תקף ${inviteLasts(x.days ?? 14)}.`],
        button: { label: "הצטרפות לקבוצה", url: x.url },
        textLines: [`הצטרפות לחשבון ${x.teamName} ב-BLUEHUB: ${x.url}`],
      });
    }
    case "link_requested": {
      const x = d as EmailData["link_requested"];
      return layout({
        subject: `בקשה לקישור אישור חדש, הזמנה ${x.orderNumber}`,
        heading: `${esc(x.teamName)} מבקשת קישור אישור חדש`,
        paragraphs: [`הקישור של ${ltr(x.email)} להזמנה ${ltr(x.orderNumber)} פג. אפשר לשלוח את ההצעה שוב מעמוד ההזמנה.`],
        button: { label: "פתיחת ההזמנה", url: x.adminUrl },
        textLines: [`${x.teamName} מבקשת קישור אישור חדש להזמנה ${x.orderNumber} (${x.email}).`],
      });
    }
    case "stage": {
      const x = d as EmailData["stage"];
      const label = statusLabel(STAGE_STATUS[x.stage], "team", x.pickup);
      const heading = `ההזמנה שלכם ${label}`;
      const body = STAGE_BODY[x.stage](x.pickup);
      return layout({
        subject: `הזמנה ${x.orderNumber} ${label}`,
        heading,
        paragraphs: [`הזמנה ${ltr(x.orderNumber)} של ${esc(x.teamName)}. ${esc(body)}`],
        button: { label: "מעקב אחרי ההזמנה", url: x.orderUrl },
        after: ["אפשר לכבות את העדכונים האלה בעמוד חשבון הקבוצה."],
        textLines: [`הזמנה ${x.orderNumber}: ${heading}. ${body}`],
      });
    }
    case "quote_reminder": {
      const x = d as EmailData["quote_reminder"];
      return layout({
        subject: `תזכורת: הצעה ${x.orderNumber} מחכה לאישורכם`,
        heading: "הצעת המחיר עדיין מחכה לאישורכם",
        paragraphs: [`הצעת המחיר להזמנה ${ltr(x.orderNumber)} של ${esc(x.teamName)} מחכה כבר ${ltr(x.days)} ימים. נזמין מהספקים אחרי האישור.`],
        button: x.approveUrl ? { label: "צפייה ואישור", url: x.approveUrl } : { label: "צפייה בהצעה", url: x.orderUrl },
        after: ["זאת התזכורת היחידה. אפשר לכבות תזכורות בעמוד חשבון הקבוצה."],
        textLines: [`הצעת המחיר להזמנה ${x.orderNumber} מחכה לאישורכם כבר ${x.days} ימים.`],
      });
    }
    case "admin_digest": {
      const x = d as EmailData["admin_digest"];
      const rows = x.items
        .map((i) => `<li style="margin:0 0 6px;font-size:15px"><a href="${esc(i.url)}" style="color:${C.brand}">בקשה ${ltr(i.orderNumber)}</a>, ${esc(i.teamName)}, מחכה ${ltr(i.hours)} שעות</li>`)
        .join("");
      return layout({
        subject: `${x.items.length} בקשות מחכות להצעה`,
        heading: "מחכה לך",
        paragraphs: [`${ltr(x.items.length)} בקשות מחכות להצעת מחיר יותר מיום:`],
        table: `<ul style="margin:0 0 8px;padding-inline-start:20px">${rows}</ul>`,
        button: { label: "כל ההזמנות", url: x.adminUrl },
        textLines: x.items.map((i) => `בקשה ${i.orderNumber}, ${i.teamName}, ${i.hours} שעות: ${i.url}`),
      });
    }
  }
  throw new Error(`unknown email event ${event}`);
}

/** The test email from /admin/settings/system: proves Resend and EMAIL_FROM work. */
export function renderTestEmail(): RenderedEmail {
  return layout({
    subject: "מייל בדיקה מ-BLUEHUB",
    heading: "המייל עובד",
    paragraphs: ["זה מייל בדיקה מעמוד מערכת בהגדרות. אם הוא הגיע, הודעות לקבוצות ולמנהלים יוצאות כרגיל."],
    textLines: ["המייל עובד.", "זה מייל בדיקה מעמוד מערכת בהגדרות. אם הוא הגיע, הודעות לקבוצות ולמנהלים יוצאות כרגיל."],
  });
}
