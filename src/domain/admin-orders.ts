import type { OrderStatus } from "./orders";
import type { ConsolidatedLine } from "./purchasing";

/**
 * The admin's view of where an order is (docs/IMPROVEMENT-PLAN.md, S10A). Worked
 * out from the order's status and the purchasing records, so nothing extra is stored.
 */
export const ADMIN_STATUSES = ["review", "team", "to_send", "sent", "warehouse", "out", "done"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export const ADMIN_STATUS_LABELS: Record<AdminStatus, string> = {
  review: "מחכה לאישורך",
  team: "מחכה לאישור קבוצה",
  to_send: "אושרה, מחכה לשליחה",
  sent: "נשלחה",
  warehouse: "הגיעה למחסן",
  out: "נשלחה לקבוצה",
  done: "הסתיימה",
};

/** One approved order line, in units. */
export type AdminLine = {
  supplierName: string;
  quoted: number;
  /** On a supplier order marked ordered. */
  ordered: number;
  /** Received and allocated to this line. */
  allocated: number;
  /** On a delivery that isn't confirmed yet. */
  prepared: number;
  /** On a confirmed delivery. */
  delivered: number;
};

export type AdminLineStage = "to_send" | "sent" | "warehouse" | "out" | "done";

export const ADMIN_LINE_STAGE_LABELS: Record<AdminLineStage, string> = {
  to_send: "ממתינה לשליחה לספק",
  sent: "נשלחה לספק",
  warehouse: "במחסן",
  out: "בדרך לקבוצה",
  done: "נמסרה",
};

const LINE_ORDER: AdminLineStage[] = ["to_send", "sent", "warehouse", "out", "done"];

export function adminLineStage(l: AdminLine): AdminLineStage {
  if (l.quoted <= 0 || l.delivered >= l.quoted) return "done";
  if (l.prepared + l.delivered >= l.quoted) return "out";
  if (l.allocated >= l.quoted) return "warehouse";
  if (l.ordered >= l.quoted) return "sent";
  return "to_send";
}

const PROGRESS_WORDS: Record<AdminLineStage, string> = {
  to_send: "נשלחו לספק",
  sent: "הגיעו למחסן",
  warehouse: "יצאו לקבוצה",
  out: "נמסרו",
  done: "נמסרו",
};

export type AdminOrderView = {
  status: AdminStatus;
  /** Why a finished order finished. */
  ended?: "delivered" | "rejected" | "cancelled";
  /** Set when the lines are at different points, e.g. "3 מתוך 5 פריטים נשלחו לספק". */
  progress: string | null;
  /** Set when the order spans vendors that aren't all sent, e.g. "WCP נשלח, AndyMark ממתין". */
  vendors: string | null;
};

/** The order's status is its earliest line, so nothing waiting is ever hidden. */
export function adminOrderStatus(status: OrderStatus, lines: AdminLine[]): AdminOrderView {
  if (status === "submitted") return { status: "review", progress: null, vendors: null };
  if (status === "quote_sent") return { status: "team", progress: null, vendors: null };
  if (status === "rejected" || status === "cancelled") return { status: "done", ended: status, progress: null, vendors: null };

  const live = lines.filter((l) => l.quoted > 0);
  const stages = live.map(adminLineStage);
  const earliest = stages.reduce<AdminLineStage>(
    (min, s) => (LINE_ORDER.indexOf(s) < LINE_ORDER.indexOf(min) ? s : min),
    "done",
  );
  if (earliest === "done") return { status: "done", ended: "delivered", progress: null, vendors: null };

  const past = stages.filter((s) => LINE_ORDER.indexOf(s) > LINE_ORDER.indexOf(earliest)).length;
  const progress = past > 0 ? `${past} מתוך ${live.length} פריטים ${PROGRESS_WORDS[earliest]}` : null;

  const byVendor = new Map<string, boolean>();
  for (const l of live) byVendor.set(l.supplierName, (byVendor.get(l.supplierName) ?? true) && l.ordered >= l.quoted);
  const states = [...byVendor.values()];
  const vendors =
    byVendor.size > 1 && states.some(Boolean) && states.some((s) => !s)
      ? [...byVendor].map(([name, sent]) => `${name} ${sent ? "נשלח" : "ממתין"}`).join(", ")
      : null;

  return { status: earliest, progress, vendors };
}

/** Orders that need the admin first, then the rest by stage; oldest first within each. */
export function sortForAdmin<T extends { view: AdminOrderView; submittedAt: Date }>(orders: T[]): T[] {
  const rank: Record<AdminStatus, number> = { review: 0, to_send: 1, team: 2, sent: 3, warehouse: 4, out: 5, done: 6 };
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
