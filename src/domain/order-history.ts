import { statusLabel, type OrderStatusKey } from "./order-status";
import type { OrderStatus } from "./orders";
import { documentsLine } from "./morning-numbers";
import { METHOD_LABEL, type PaymentMethod } from "./payments";
import { formatIls } from "./pricing";

/**
 * The order card's history (M2): each audit_log row about the order, its quotes and its
 * delivery notes, as one Hebrew line. Noun phrases ("שליחת הצעה"), so no line needs to know
 * who did it to agree with them; the card adds the name.
 */
export type HistoryEntry = {
  entity: string;
  action: string;
  before: unknown;
  after: unknown;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const withReason = (text: string, reason: unknown) => (str(reason) ? `${text}: ${str(reason)}` : text);

const STORED_STEP: Record<OrderStatus, OrderStatusKey> = {
  submitted: "awaiting_quote",
  quote_sent: "quote_sent",
  approved: "to_order",
  rejected: "rejected",
  cancelled: "cancelled",
};
const stored = (v: unknown) => (typeof v === "string" && v in STORED_STEP ? statusLabel(STORED_STEP[v as OrderStatus], "admin") : null);

function orderLine(action: string, before: Obj, after: Obj): string | null {
  switch (action) {
    case "cancel":
      return "ביטול ההזמנה מצד הקבוצה";
    case "undo_cancel":
      return "החזרת ההזמנה אחרי ביטול";
    case "reject":
      return withReason("דחיית ההזמנה", after.reason);
    case "admin_cancel": {
      const surplus = Array.isArray(after.surplus) ? after.surplus.reduce((n: number, s) => n + (num(obj(s).qty) ?? 0), 0) : 0;
      const text = withReason("ביטול ההזמנה", after.reason);
      return surplus > 0 ? `${text} (${surplus} יח׳ נשארו כעודף מלאי)` : text;
    }
    case "reopen":
      return stored(after.status) ? `פתיחה מחדש, ההזמנה חזרה ל״${stored(after.status)}״` : "פתיחה מחדש";
    case "move":
      return `העברה מ${str(before.team) ?? "קבוצה אחרת"} אל ${str(after.team) ?? "קבוצה אחרת"}`;
    case "mark_unavailable":
      return `סימון ״לא זמין״: ${str(after.sku) ?? str(after.title) ?? "פריט"}`;
    case "unmark_unavailable":
      return `ביטול סימון ״לא זמין״: ${str(after.sku) ?? str(after.title) ?? "פריט"}`;
    case "replace_item": {
      const from = str(obj(before.item).supplierSku) ?? str(obj(before.item).title) ?? "פריט";
      const to = str(obj(after.item).supplierSku) ?? str(obj(after.item).title) ?? "פריט אחר";
      const version = num(after.version);
      return `החלפת פריט: ${to} במקום ${from}` + (version ? `, גרסה ${version} נשלחה לאישור` : "");
    }
    default:
      return null;
  }
}

function quoteLine(action: string, before: Obj, after: Obj): string | null {
  const version = num(after.version);
  const v = version ? `, גרסה ${version}` : "";
  const via = after.via === "link" ? " (בקישור אישור)" : "";
  switch (action) {
    case "send":
      return after.revision ? `שליחת הצעה${v}, אחרי שחלק מהפריטים כבר הוזמנו` : `שליחת הצעה${v}`;
    case "approve":
      return `אישור ההצעה${v}${via}`;
    case "reject":
      return withReason(`דחיית ההצעה${v}${via}`, after.reason);
    case "change_request":
      return withReason(`בקשת שינוי${v}`, after.reason);
    case "undo":
      return before.status === "approved" ? "ביטול אישור ההצעה" : "ביטול דחיית ההצעה";
    case "morning_numbers": {
      const line = documentsLine({ quoteNo: str(after.morningQuoteNo), dealNo: str(after.morningDealNo), receipts: [] });
      return line ? `מספרים בחשבונית ירוקה: ${line}` : "מחיקת המספרים בחשבונית ירוקה";
    }
    default:
      return null;
  }
}

function deliveryLine(action: string, before: Obj, after: Obj): string | null {
  const number = num(after.number) ?? num(before.number);
  const n = number ? ` ${number}` : "";
  switch (action) {
    case "create":
      return `הפקת תעודת משלוח${n}`;
    case "confirm":
      return str(after.recipientName) ? `אישור מסירה, קיבל/ה ${str(after.recipientName)}` : "אישור מסירה";
    case "unconfirm":
      return `ביטול אישור המסירה${n}`;
    case "cancel":
      return `ביטול תעודת משלוח${n}`;
    default:
      return null;
  }
}

/** One history line, or null for a row the card doesn't show. */
export function describeHistory(entry: HistoryEntry): string | null {
  const before = obj(entry.before);
  const after = obj(entry.after);
  if (entry.action.startsWith("email:")) {
    const to = str(after.to);
    const subject = str(after.subject);
    const text = `דוא״ל${to ? ` אל ${to}` : ""}${subject ? `: ${subject}` : ""}`;
    return after.ok === false ? `${text} (נכשל)` : text;
  }
  if (entry.entity === "team_order") return orderLine(entry.action, before, after);
  if (entry.entity === "quote") return quoteLine(entry.action, before, after);
  if (entry.entity === "delivery") return deliveryLine(entry.action, before, after);
  if (entry.entity === "payment") return paymentLine(entry.action, before, after);
  return null;
}

/** P1: a payment recorded or voided ("רישום תשלום ₪1,250, העברה בנקאית"). */
function paymentLine(action: string, before: Obj, after: Obj): string | null {
  const row = action === "void" ? before : after;
  const amount = typeof row.amountIls === "number" || typeof row.amountIls === "string" ? Number(row.amountIls) : null;
  const money = amount === null ? "" : ` ${formatIls(amount, { agorot: true })}`;
  const method = typeof row.method === "string" && row.method in METHOD_LABEL ? `, ${METHOD_LABEL[row.method as PaymentMethod]}` : "";
  if (action === "record") return `רישום תשלום${money}${method}`;
  if (action === "void") return withReason(`ביטול תשלום${money}`, after.reason);
  if (action === "morning_doc_no") return str(after.morningDocNo) ? `חשבונית מס/קבלה ${str(after.morningDocNo)} בחשבונית ירוקה` : "מחיקת מספר החשבונית";
  return null;
}
