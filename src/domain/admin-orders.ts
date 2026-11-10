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

/** Statuses where the next step is the admin's; the rest wait on the team, a supplier or the courier. */
export const NEEDS_ADMIN: ReadonlySet<OrderStatusKey> = new Set(["awaiting_quote", "to_order", "at_warehouse", "to_team"]);

export type InboxSort = "action" | "newest" | "team";
export const INBOX_SORTS: { key: InboxSort; label: string }[] = [
  { key: "action", label: "מחכה לך" },
  { key: "newest", label: "חדשות" },
  { key: "team", label: "קבוצה" },
];

export const parseInboxSort = (value: string | undefined): InboxSort =>
  value === "newest" || value === "team" ? value : "action";

type InboxOrder = { view: OrderView; submittedAt: Date; teamNumber: number; teamDisplay: string };

/** The inbox's groups, each with a heading. "action" puts "מחכה לך" first, oldest first. */
export function groupInbox<T extends InboxOrder>(orders: T[], sort: InboxSort): { heading: string; orders: T[] }[] {
  if (sort === "newest") {
    const sorted = [...orders].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
    return sorted.length ? [{ heading: "החדשות קודם", orders: sorted }] : [];
  }
  if (sort === "team") {
    const byTeam = new Map<string, T[]>();
    for (const o of [...orders].sort((a, b) => a.teamNumber - b.teamNumber || a.submittedAt.getTime() - b.submittedAt.getTime()))
      byTeam.set(o.teamDisplay, [...(byTeam.get(o.teamDisplay) ?? []), o]);
    return [...byTeam].map(([heading, list]) => ({ heading, orders: list }));
  }
  const sorted = sortForAdmin(orders);
  const mine = sorted.filter((o) => NEEDS_ADMIN.has(o.view.status));
  const others = sorted.filter((o) => !NEEDS_ADMIN.has(o.view.status));
  return [
    { heading: "מחכה לך", orders: mine },
    { heading: "מחכה לקבוצה או לספק", orders: others },
  ].filter((g) => g.orders.length > 0);
}
