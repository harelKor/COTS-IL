import { canAdvance } from "./order-status";
import { UNIT, countOf } from "./plural";

export type Share = { orderItemId: string; open: number };

/** Hands received units to teams, oldest order first. Any shortage lands on the newest orders. */
export function fifoAllocate(goodQty: number, shares: Share[]): { orderItemId: string; qty: number }[] {
  let left = goodQty;
  const result: { orderItemId: string; qty: number }[] = [];
  for (const share of shares) {
    const qty = Math.min(left, Math.max(share.open, 0));
    if (qty > 0) result.push({ orderItemId: share.orderItemId, qty });
    left -= qty;
  }
  return result;
}

const isCount = (n: number) => Number.isInteger(n) && n >= 0;

/** Hebrew message when a receipt line is impossible, otherwise null. */
export function validateReceiptLine(line: { open: number; received: number; damaged: number }): string | null {
  if (!isCount(line.received) || !isCount(line.damaged)) return "כמות לא תקינה";
  if (canAdvance("receive", { reached: line.open, done: 0 }, line.received)) return `התקבל יותר מהיתרה במשלוח (${line.open})`;
  if (line.damaged > line.received) return "אי אפשר שיהיו יותר פגומים מכמות שהתקבלה";
  return null;
}

export type AllocationRow = {
  qty: number;
  /** Units this order line may get from the supplier order. */
  share: number;
  /** Already allocated to this order line from other receipts. */
  allocatedElsewhere: number;
  /** Already delivered from this allocation, which can't be taken back. */
  delivered: number;
};

/** Spec §10: never allocate more than was actually received, or more than a team is owed. */
export function validateAllocations(goodQty: number, rows: AllocationRow[]): string | null {
  if (rows.some((r) => !isCount(r.qty))) return "כמות לא תקינה";
  const total = rows.reduce((sum, r) => sum + r.qty, 0);
  if (total > goodQty) return `אפשר להקצות עד ${goodQty} יחידות תקינות`;
  if (rows.some((r) => r.qty < r.delivered)) return "אי אפשר להקצות פחות ממה שכבר נמסר";
  if (rows.some((r) => r.qty + r.allocatedElsewhere > r.share)) return "אי אפשר להקצות לקבוצה יותר ממה שהוזמן עבורה";
  return null;
}


export type HeldAllocation = { orderItemId: string; qty: number; delivered: number };

/**
 * A received line's good units after its quantity was corrected in place (M2). Units already
 * on a delivery note stay where they are. A smaller count takes units back from the newest
 * orders first; a larger one hands the extra out oldest first, within what each line is still
 * owed (`shares`, oldest first, `open` counted across all receipts). Returns every order line's
 * new quantity on this receipt line (0 means none), or a Hebrew error.
 */
export function rebalanceAllocations(goodQty: number, held: HeldAllocation[], shares: Share[]): { orderItemId: string; qty: number }[] | { error: string } {
  if (!isCount(goodQty)) return { error: "כמות לא תקינה" };
  const onNotes = held.reduce((n, h) => n + h.delivered, 0);
  if (goodQty < onNotes) return { error: `${countOf(onNotes, UNIT)} מהשורה הזאת ${onNotes === 1 ? "כבר בתעודת משלוח" : "כבר בתעודות משלוח"}, ולכן אי אפשר לרדת מתחת לזה` };

  const order = shares.map((s) => s.orderItemId);
  for (const h of held) if (!order.includes(h.orderItemId)) order.push(h.orderItemId);
  const qty = new Map(order.map((id) => [id, held.find((h) => h.orderItemId === id)?.qty ?? 0]));
  let diff = goodQty - held.reduce((n, h) => n + h.qty, 0);

  if (diff < 0) {
    for (const id of [...order].reverse()) {
      if (diff === 0) break;
      const floor = held.find((h) => h.orderItemId === id)?.delivered ?? 0;
      const take = Math.min(qty.get(id)! - floor, -diff);
      qty.set(id, qty.get(id)! - take);
      diff += take;
    }
  } else if (diff > 0) {
    for (const extra of fifoAllocate(diff, shares)) qty.set(extra.orderItemId, qty.get(extra.orderItemId)! + extra.qty);
  }
  return order.map((id) => ({ orderItemId: id, qty: qty.get(id)! }));
}
