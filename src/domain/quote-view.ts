import type { OrderStatusKey } from "./order-status";

/**
 * What the shared quote view (S8) shows: the changes against the request or the
 * previous version, the undo window after a decision, and what "order again" puts back.
 * Pure: the pages load the rows and pass them in.
 */

export type RequestedLine = { id: string; title: string; supplierSku: string | null; qty: number; unitPriceIls: number };
export type QuotedLine = { itemId: string; qty: number; unitPriceIls: number; changeReason: string | null };

export type QuoteChange = {
  itemId: string;
  title: string;
  supplierSku: string | null;
  kind: "removed" | "qty" | "price" | "qty_price";
  qtyBefore: number;
  qtyAfter: number;
  priceBefore: number;
  priceAfter: number;
  reason: string | null;
};

/**
 * Each line whose quantity or price differs from what the team asked for, or from the
 * previous version when there is one. A line quoted at 0 is "removed", not "×0 ₪0".
 */
export function quoteChanges(items: RequestedLine[], lines: QuotedLine[], previous?: QuotedLine[]): QuoteChange[] {
  const before = new Map(previous?.map((l) => [l.itemId, l]));
  const changes: QuoteChange[] = [];
  for (const item of items) {
    const line = lines.find((l) => l.itemId === item.id);
    if (!line) continue;
    const old = before.get(item.id) ?? { qty: item.qty, unitPriceIls: item.unitPriceIls };
    if (line.qty === 0 && old.qty === 0) continue;
    const qtyChanged = line.qty !== old.qty;
    const priceChanged = line.qty > 0 && line.unitPriceIls !== old.unitPriceIls;
    if (!qtyChanged && !priceChanged) continue;
    changes.push({
      itemId: item.id,
      title: item.title,
      supplierSku: item.supplierSku,
      kind: line.qty === 0 ? "removed" : qtyChanged && priceChanged ? "qty_price" : qtyChanged ? "qty" : "price",
      qtyBefore: old.qty,
      qtyAfter: line.qty,
      priceBefore: old.unitPriceIls,
      priceAfter: line.unitPriceIls,
      reason: line.changeReason?.trim() || null,
    });
  }
  return changes;
}

/** Seconds after approving, rejecting or cancelling in which the team can take it back. */
export const UNDO_SECONDS = 30;

export function undoOpen(decidedAt: Date, now = new Date()) {
  return now.getTime() - decidedAt.getTime() <= UNDO_SECONDS * 1000;
}

/** Last day a quote holds, or null while the business hasn't set how long. */
export function quoteValidUntil(sentAt: Date, days: number | null): Date | null {
  return days ? new Date(sentAt.getTime() + days * 24 * 60 * 60 * 1000) : null;
}

/**
 * "Order again": the approved quote's quantities, without the lines it removed. With no
 * approved quote (still waiting, or rejected), what the team asked for.
 */
export function reorderLines(items: { id: string; variantId: string; qty: number }[], approved: QuotedLine[] | null) {
  if (!approved) return items.map((i) => ({ variantId: i.variantId, qty: i.qty }));
  return items.flatMap((i) => {
    const qty = approved.find((l) => l.itemId === i.id)?.qty ?? 0;
    return qty > 0 ? [{ variantId: i.variantId, qty }] : [];
  });
}

/** /orders: quotes waiting for the team first, then the rest as they come (newest first). */
export function waitingFirst<T extends { id: string }>(orders: T[], stages: Map<string, OrderStatusKey>) {
  const waiting = orders.filter((o) => stages.get(o.id) === "quote_sent");
  return { waiting, rest: orders.filter((o) => stages.get(o.id) !== "quote_sent") };
}
