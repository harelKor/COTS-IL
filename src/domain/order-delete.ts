import type { OrderStatus } from "./orders";
import { UNIT, countOf } from "./plural";

/**
 * Deleting an order for good, at any stage (the admin only). The order, its lines, quote
 * versions (so their /q links stop working), approvals, history rows and email records go.
 * What points at it from outside is untied, so the supplier side stays true:
 *  - Draft and cancelled supplier orders: the order's units are taken off them (a draft line
 *    left with no units goes too).
 *  - Supplier orders marked ordered: the units were bought and paid for, so they stay on the
 *    supplier order, no longer for any team ("ללא קבוצה"). Line quantities, costs and the
 *    purchasing totals don't change.
 *  - Received stock: units not yet delivered go back to free stock. Units already delivered
 *    left the warehouse, so they stay counted as taken, for no team.
 *  - Delivery notes: the order's units come off them, and a note left empty is deleted.
 * src/app/admin/orders/corrections.ts (deleteOrder) carries this out in one transaction.
 */

export type PoStatus = "draft" | "ordered" | "cancelled";

/** One share of a supplier-order line held for one of the order's lines. */
export type DeletePoShare = { poLineId: string; orderItemId: string; qty: number; poStatus: PoStatus; poNumber: number };

/** One received-stock allocation to one of the order's lines. */
export type DeleteStockShare = {
  id: string;
  qty: number;
  /** Units of it on delivery notes already handed to the team. */
  delivered: number;
  /** Units of it on delivery notes not handed over yet. */
  prepared: number;
};

export type DeletePlan = {
  /** Shares on draft or cancelled supplier orders: deleted. */
  removeShares: DeletePoShare[];
  /** Shares on supplier orders marked ordered: kept, for no team. */
  unassignShares: DeletePoShare[];
  /** Stock allocations with nothing delivered: deleted (the units are free stock again). */
  removeStock: string[];
  /** Stock allocations with delivered units: shrunk to what was delivered, for no team. */
  keepStock: { id: string; qty: number }[];
  /** Units the order had on supplier orders marked ordered, which stay there. */
  keptOrdered: number;
  /** Units taken off draft supplier orders. */
  released: number;
  /** Supplier orders marked ordered that keep the units, by number. */
  orderedPoNumbers: number[];
  /** What the admin reads before confirming: Hebrew sentences. */
  warnings: string[];
};

const units = (n: number) => countOf(n, UNIT);
const agree = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function deletePlan(shares: DeletePoShare[], stock: DeleteStockShare[]): DeletePlan {
  const removeShares = shares.filter((s) => s.poStatus !== "ordered");
  const unassignShares = shares.filter((s) => s.poStatus === "ordered");
  const removeStock = stock.filter((s) => s.delivered <= 0).map((s) => s.id);
  const keepStock = stock.filter((s) => s.delivered > 0).map((s) => ({ id: s.id, qty: Math.min(s.qty, s.delivered) }));

  const keptOrdered = unassignShares.reduce((n, s) => n + s.qty, 0);
  const released = removeShares.filter((s) => s.poStatus === "draft").reduce((n, s) => n + s.qty, 0);
  const orderedPoNumbers = [...new Set(unassignShares.map((s) => s.poNumber))].sort((a, b) => a - b);
  const delivered = stock.reduce((n, s) => n + s.delivered, 0);
  const prepared = stock.reduce((n, s) => n + s.prepared, 0);
  const inStock = stock.reduce((n, s) => n + Math.max(0, s.qty - s.delivered), 0);

  const warnings: string[] = [];
  if (released > 0) warnings.push(`${units(released)} ${agree(released, "תוסר", "יוסרו")} מטיוטות של הזמנות ספק.`);
  if (keptOrdered > 0)
    warnings.push(
      `${units(keptOrdered)} ${agree(keptOrdered, "כבר הוזמנה", "כבר הוזמנו")} מהספק (${orderedPoNumbers.map((n) => `הזמנת ספק ${n}`).join(", ")}). ${agree(keptOrdered, "היא נשארת", "הן נשארות")} בהזמנת הספק ללא קבוצה, והסכומים שם לא משתנים.`,
    );
  if (inStock > 0) warnings.push(`${units(inStock)} במחסן ${agree(inStock, "חוזרת", "חוזרות")} למלאי הפנוי.`);
  if (prepared > 0) warnings.push(`${units(prepared)} ${agree(prepared, "תוסר", "יוסרו")} מתעודות משלוח שעוד לא נמסרו.`);
  if (delivered > 0) warnings.push(`${units(delivered)} ${agree(delivered, "כבר נמסרה", "כבר נמסרו")} לקבוצה. ${agree(delivered, "היא נרשמת", "הן נרשמות")} כיצאו מהמחסן, ללא הזמנה.`);

  return { removeShares, unassignShares, removeStock, keepStock, keptOrdered, released, orderedPoNumbers, warnings };
}

/** What the audit log keeps of a deleted order: who, what, and how much, so it can be traced later. */
export function deleteSnapshot(input: {
  order: { id: string; number: number; status: OrderStatus; teamId: string; submittedAt: Date | string };
  team: string;
  items: { supplierCode: string; supplierSku: string | null; title: string; qty: number; unitPriceIls: number }[];
  quotes: { version: number; status: string; shippingIls: number }[];
  plan: Pick<DeletePlan, "keptOrdered" | "released" | "orderedPoNumbers">;
}) {
  const { order, team, items, quotes, plan } = input;
  return {
    orderNumber: order.number,
    team,
    teamId: order.teamId,
    status: order.status,
    submittedAt: order.submittedAt,
    lines: items.length,
    units: items.reduce((n, i) => n + i.qty, 0),
    requestedIls: items.reduce((n, i) => n + i.qty * i.unitPriceIls, 0),
    quoteVersions: quotes.length,
    lastQuote: quotes.length ? quotes.reduce((a, b) => (b.version > a.version ? b : a)) : null,
    keptOnSupplierOrders: plan.keptOrdered,
    supplierOrders: plan.orderedPoNumbers,
    releasedFromDrafts: plan.released,
  };
}
