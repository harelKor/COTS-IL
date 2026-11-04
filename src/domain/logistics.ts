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
  if (line.received > line.open) return `התקבל יותר מהיתרה במשלוח (${line.open})`;
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

export type LineProgress = {
  quoted: number;
  ordered: number;
  inTransit: boolean;
  allocated: number;
  delivered: number;
};

export type LineStage = "waiting" | "ordered" | "in_transit" | "allocated" | "delivered";

export const LINE_STAGE_LABELS: Record<LineStage, string> = {
  waiting: "ממתינה לרכש",
  ordered: "הוזמנה מהספק",
  in_transit: "בדרך",
  allocated: "הגיעה, ממתינה למסירה",
  delivered: "נמסרה",
};

/** A line's status comes from the quantities, so it can't drift away from them (spec §10). */
export function lineStage({ quoted, ordered, inTransit, allocated, delivered }: LineProgress): LineStage {
  if (quoted > 0 && delivered >= quoted) return "delivered";
  if (allocated > delivered) return "allocated";
  if (inTransit) return "in_transit";
  return ordered > 0 ? "ordered" : "waiting";
}
