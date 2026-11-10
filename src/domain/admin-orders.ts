import type { OrderStatusKey, OrderView } from "./order-status";
import type { ConsolidatedLine } from "./purchasing";

/** Orders that need the admin first, then the rest by stage; oldest first within each. */
export function sortForAdmin<T extends { view: OrderView; submittedAt: Date }>(orders: T[]): T[] {
  const rank: Record<OrderStatusKey, number> = {
    awaiting_quote: 0,
    to_order: 1,
    quote_sent: 2,
    ordered: 3,
    to_warehouse: 4,
    at_warehouse: 5,
    to_team: 6,
    delivered: 7,
    rejected: 7,
    cancelled: 7,
  };
  return [...orders].sort(
    (a, b) => rank[a.view.status] - rank[b.view.status] || a.submittedAt.getTime() - b.submittedAt.getTime(),
  );
}

/** What goes into a vendor batch: everything waiting, minus the order lines left out. */
export function selectBatch(lines: ConsolidatedLine[], excluded: ReadonlySet<string>): ConsolidatedLine[] {
  return lines.flatMap((line) => {
    const allocations = line.allocations.filter((a) => !excluded.has(a.orderItemId));
    if (allocations.length === 0) return [];
    return [{ ...line, allocations, qty: allocations.reduce((sum, a) => sum + a.qty, 0) }];
  });
}

/** Distinct orders a batch serves. */
export function batchOrderCount(lines: ConsolidatedLine[]): number {
  return new Set(lines.flatMap((l) => l.allocations.map((a) => a.orderNumber))).size;
}
