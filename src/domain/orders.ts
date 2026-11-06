import { createHash } from "node:crypto";

export type OrderStatus = "submitted" | "quote_sent" | "approved" | "rejected" | "cancelled";
export type TeamRole = "team_admin" | "buyer" | "viewer";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  submitted: "ממתינה לבדיקת הספק הישראלי",
  quote_sent: "הצעה ממתינה לאישור הקבוצה",
  approved: "הצעה אושרה",
  rejected: "נדחתה",
  cancelled: "בוטלה",
};

/** Students (buyer) and mentors (team_admin) build the team's cart. */
export const canOrder = (role: TeamRole) => role === "team_admin" || role === "buyer";
/** Only a mentor sends the cart as a quote request, and only a mentor approves the quote. */
export const canSendRequest = (role: TeamRole) => role === "team_admin";
export const canApproveQuote = (role: TeamRole) => role === "team_admin";

export type TeamStatus = "pending" | "active" | "rejected" | "suspended";
/** A new team can send its first request before it's approved: the Israeli supplier reviews both together. */
export const teamCanOrder = (status: TeamStatus) => status === "active" || status === "pending";

/** A quote can be changed even after approval, which sends the order back for a new approval. */
export const canSendQuote = (status: OrderStatus) => status !== "cancelled";
export const canDecideQuote = (status: OrderStatus) => status === "quote_sent";
export const canCancelOrder = (status: OrderStatus) => status === "submitted" || status === "quote_sent";
export const canRejectOrder = (status: OrderStatus) => status === "submitted" || status === "quote_sent";

export type QuoteLine = { itemId: string; qty: number; unitPriceIls: number };

export function quoteTotals(lines: Pick<QuoteLine, "qty" | "unitPriceIls">[], shippingIls: number) {
  const subtotal = lines.reduce((sum, line) => sum + line.qty * line.unitPriceIls, 0);
  return { subtotal, shipping: shippingIls, total: subtotal + shippingIls };
}

export type RequestedItem = { id: string; qty: number; unitPriceIls: number };
export type QuoteLineInput = QuoteLine & { changeReason: string };

/** Hebrew messages by item id. A quote that differs from what the team asked for must say why. */
export function validateQuoteLines(items: RequestedItem[], lines: QuoteLineInput[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const byItem = new Map(lines.map((line) => [line.itemId, line]));

  for (const item of items) {
    const line = byItem.get(item.id);
    if (!line) {
      errors[item.id] = "חסרים פרטי שורה";
    } else if (!Number.isInteger(line.qty) || line.qty < 0) {
      errors[item.id] = "כמות לא תקינה";
    } else if (!Number.isInteger(line.unitPriceIls) || line.unitPriceIls < 0 || (line.qty > 0 && line.unitPriceIls === 0)) {
      errors[item.id] = "מחיר לא תקין";
    } else if ((line.qty !== item.qty || line.unitPriceIls !== item.unitPriceIls) && !line.changeReason.trim()) {
      errors[item.id] = "צריך לתעד את סיבת השינוי";
    }
  }
  return errors;
}

export type LineChange = { qtyBefore?: number; priceBefore?: number };

/** What changed against the previous version, so a new version's changes stay visible to the team. */
export function diffQuoteLines(previous: QuoteLine[], current: QuoteLine[]): Map<string, LineChange> {
  const before = new Map(previous.map((line) => [line.itemId, line]));
  const changes = new Map<string, LineChange>();
  for (const line of current) {
    const old = before.get(line.itemId);
    if (!old) continue;
    const change: LineChange = {};
    if (old.qty !== line.qty) change.qtyBefore = old.qty;
    if (old.unitPriceIls !== line.unitPriceIls) change.priceBefore = old.unitPriceIls;
    if (Object.keys(change).length > 0) changes.set(line.itemId, change);
  }
  return changes;
}

/** Fingerprint of what the team saw when approving. Line order doesn't affect it. */
export function quoteContentHash(quote: { orderId: string; version: number; shippingIls: number; lines: QuoteLine[] }) {
  const lines = [...quote.lines]
    .sort((a, b) => a.itemId.localeCompare(b.itemId))
    .map((l) => [l.itemId, l.qty, l.unitPriceIls]);
  return createHash("sha256")
    .update(JSON.stringify([quote.orderId, quote.version, quote.shippingIls, lines]))
    .digest("hex");
}
