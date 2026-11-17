import type { OrderStatus, QuoteLineInput } from "./orders";
import { UNIT, countOf } from "./plural";

/**
 * The admin's corrections to an order (M2): cancel at any stage, reopen, move to another
 * team, delete it (src/domain/order-delete.ts), a part that's no longer sold, and a new quote version after lines
 * were ordered. The server actions in src/app/admin/orders/corrections.ts read these rules.
 */

export type QuoteStatus = "sent" | "approved" | "rejected" | "superseded";

/** The admin can cancel at any stage that isn't already cancelled, a rejected order included (to release its drafts). */
export const canAdminCancel = (status: OrderStatus) => status !== "cancelled";

export const canReopen = (status: OrderStatus) => status === "rejected" || status === "cancelled";

/** An order is open while it can still change: before a quote, waiting for the team, or approved. */
export const isOpenOrder = (status: OrderStatus) => status === "submitted" || status === "quote_sent" || status === "approved";

/** Lines can be marked "לא זמין" or replaced only on an open order. */
export const canEditLines = isOpenOrder;

/**
 * Where a reopened order goes back to. `stoppedFrom` is the status it had when the admin or
 * the team stopped it (from the audit log; null when the log doesn't say), `latestQuote` the
 * status of its newest quote version.
 *  - It was approved: back to approved, and its last quote is approved again.
 *  - It has a quote: back to waiting for the team, with the last quote open again.
 *  - Otherwise: back to waiting for a quote.
 */
export function reopenTarget(
  stoppedFrom: OrderStatus | null,
  latestQuote: QuoteStatus | null,
): { status: "submitted" | "quote_sent" | "approved"; quote: "approved" | "sent" | null } {
  if (!latestQuote) return { status: "submitted", quote: null };
  if (stoppedFrom === "approved") return { status: "approved", quote: "approved" };
  return { status: "quote_sent", quote: "sent" };
}

/** Where one order line's units are, for cancelling it. */
export type CancelLine = {
  itemId: string;
  label: string;
  /** On draft supplier orders: released by the cancel. */
  onDraft: number;
  /** On supplier orders marked ordered: bought, so they stay as surplus stock. */
  ordered: number;
  shipped: number;
  received: number;
  /** On a delivery note that isn't confirmed yet. */
  prepared: number;
  delivered: number;
};

export type SurplusLine = { itemId: string; label: string; qty: number; stage: "ordered" | "shipped" | "received" };

export type CancelPlan = {
  /** Why the cancel can't go ahead yet, or null. */
  blocked: string | null;
  /** Units taken off draft supplier orders. */
  released: number;
  /** Bought units no team will get: kept on record as surplus stock, never deleted. */
  surplus: SurplusLine[];
  /** What the admin is told before and after: Hebrew sentences. */
  warnings: string[];
};

/**
 * What cancelling does to the order's lines. Drafts are released. Units already ordered,
 * shipped or received stay on their supplier order and become surplus stock, at the furthest
 * stage they reached. Units on an unconfirmed delivery note block the cancel, since the note
 * would hand them to the team anyway: cancel the note first.
 */
export function cancelPlan(lines: CancelLine[]): CancelPlan {
  const prepared = lines.reduce((n, l) => n + l.prepared, 0);
  const surplus: SurplusLine[] = [];
  for (const l of lines) {
    const qty = l.ordered - l.delivered;
    if (qty <= 0) continue;
    const stage = l.received > l.delivered ? "received" : l.shipped > 0 ? "shipped" : "ordered";
    surplus.push({ itemId: l.itemId, label: l.label, qty, stage });
  }
  const sum = (pick: (l: CancelLine) => number) => lines.reduce((n, l) => n + pick(l), 0);
  const ordered = sum((l) => l.ordered);
  const shipped = sum((l) => l.shipped);
  const received = sum((l) => l.received);
  const delivered = sum((l) => l.delivered);
  const warnings: string[] = [];
  if (ordered > 0) warnings.push(`${units(ordered)} ${agree(ordered, "כבר הוזמנה", "כבר הוזמנו")} מהספק. ${agree(ordered, "היא נשארת בהזמנת הספק ונרשמת", "הן נשארות בהזמנת הספק ונרשמות")} כעודף מלאי.`);
  if (shipped > 0) warnings.push(`${units(shipped)} ${agree(shipped, "כבר נשלחה", "כבר נשלחו")} מהספק.`);
  if (received > 0) warnings.push(`${units(received)} ${agree(received, "כבר הגיעה", "כבר הגיעו")} למחסן, וההקצאה לקבוצה תשוחרר.`);
  if (delivered > 0) warnings.push(`${units(delivered)} ${agree(delivered, "כבר נמסרה", "כבר נמסרו")} לקבוצה.`);
  return {
    blocked: prepared > 0 ? `${units(prepared)} ${agree(prepared, "נמצאת", "נמצאות")} בתעודת משלוח שעוד לא נמסרה. קודם צריך לבטל את התעודה.` : null,
    released: sum((l) => l.onDraft),
    surplus,
    warnings,
  };
}

const units = (n: number) => countOf(n, UNIT);
const agree = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Moving an order to another team: not onto itself, and not once its units are on a delivery note (the note belongs to a team). */
export function moveBlocker(facts: { fromTeamId: string; toTeamId: string; onDeliveryNotes: number }): string | null {
  if (facts.fromTeamId === facts.toTeamId) return "ההזמנה כבר שייכת לקבוצה הזאת";
  if (facts.onDeliveryNotes > 0) return "יש להזמנה תעודות משלוח, ולכן אי אפשר להעביר אותה. קודם צריך לבטל את התעודות.";
  return null;
}

/** Replacing a line's part: not once it was bought from a supplier, and not with the same part. */
export function replaceBlocker(facts: { status: OrderStatus; ordered: number; sameVariant: boolean; hasPrice: boolean }): string | null {
  if (!canEditLines(facts.status)) return "אפשר להחליף פריט רק בהזמנה פתוחה";
  if (facts.ordered > 0) return "הפריט כבר הוזמן מהספק. קודם צריך לבטל את הזמנת הספק.";
  if (facts.sameVariant) return "זה אותו פריט";
  if (!facts.hasPrice) return "לפריט שנבחר אין מחיר בקטלוג";
  return null;
}

/**
 * Whether a replacement needs the team's approval again: only once a quote went out (before
 * that the admin quotes the new part anyway), and only when the price changed.
 */
export const replacementNeedsApproval = (facts: { status: OrderStatus; quotedPrice: number | null; newPrice: number }) =>
  facts.status !== "submitted" && facts.quotedPrice !== null && facts.quotedPrice !== facts.newPrice;

type PreviousLine = { itemId: string; qty: number; unitPriceIls: number; changeReason: string | null };

/**
 * A new version of a quote whose lines are already on supplier orders: quantities stay as
 * they were (they were bought), and a price that changes against the previous version has
 * to say why, in words of its own. Hebrew messages by item id.
 */
export function validateRevision(previous: PreviousLine[], lines: QuoteLineInput[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const before = new Map(previous.map((l) => [l.itemId, l]));
  for (const line of lines) {
    const old = before.get(line.itemId);
    if (!old) continue;
    if (line.qty !== old.qty) errors[line.itemId] = "הפריטים כבר בהזמנת ספק, ולכן הכמות נשארת כמו בגרסה הקודמת";
    else if (line.unitPriceIls !== old.unitPriceIls && (!line.changeReason.trim() || line.changeReason.trim() === (old.changeReason ?? "").trim()))
      errors[line.itemId] = "צריך לכתוב למה המחיר השתנה מהגרסה הקודמת";
  }
  return errors;
}
