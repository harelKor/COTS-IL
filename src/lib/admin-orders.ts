import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sortForAdmin } from "@/domain/admin-orders";
import { teamDisplay } from "@/domain/display";
import { ORDER_STATUS_KEYS, orderStatus, type LineFacts, type OrderStatusKey, type OrderView } from "@/domain/order-status";
import { getOrderLines } from "@/lib/order-status";
import type { OrderStatus } from "@/domain/orders";
import type { OrderMoney } from "@/domain/payments";
import { getMoneyByOrder } from "@/lib/payments";

const {
  deliveries,
  deliveryItems,
  poAllocations,
  poLines,
  quoteLines,
  quotes,
  receiptLines,
  receipts,
  shipments,
  stockAllocations,
  supplierPos,
  suppliers,
  teamOrderItems,
  teamOrders,
  teams,
} = schema;

export type AdminOrderSummary = {
  id: string;
  number: number;
  status: OrderStatus;
  submittedAt: Date;
  teamId: string;
  teamName: string;
  teamLabel: string;
  /** "<name> <program> <number>" (teamDisplay). */
  teamDisplay: string;
  teamNumber: number;
  teamProgram: string;
  teamStatus: string;
  /** Suppliers with lines in the approved quote that aren't on an ordered supplier order yet. */
  vendorsToOrder: { id: string; name: string }[];
  /** Lines, and the units on them, in the latest quote (or the request before one). */
  itemCount: number;
  unitCount: number;
  /** The vendors the order's items come from, by name. */
  supplierNames: string[];
  totalIls: number;
  view: OrderView;
  /** P1: what the approved quote owes and what was paid on it. */
  money: OrderMoney;
};

/** Every order card's summary fields, in the admin's order. Two queries for any number of orders. */
export async function getOrderSummaries(): Promise<AdminOrderSummary[]> {
  const latestQuote = sql`(SELECT q.id FROM ${quotes} q WHERE q.order_id = ${teamOrders.id} AND q.status <> 'superseded' ORDER BY q.version DESC LIMIT 1)`;
  const rows = await db
    .select({
      id: teamOrders.id,
      number: teamOrders.number,
      status: teamOrders.status,
      submittedAt: teamOrders.submittedAt,
      teamId: teams.id,
      teamName: teams.name,
      teamProgram: teams.program,
      teamNumber: teams.number,
      teamStatus: teams.status,
      // Lines and units in the latest quote that still counts, or in the request before any quote.
      itemCount: sql<number>`CASE WHEN ${latestQuote} IS NULL
        THEN (SELECT count(*)::int FROM ${teamOrderItems} WHERE ${teamOrderItems.orderId} = ${teamOrders.id})
        ELSE (SELECT count(*)::int FROM ${quoteLines} ql WHERE ql.quote_id = ${latestQuote} AND ql.qty > 0) END`,
      unitCount: sql<number>`CASE WHEN ${latestQuote} IS NULL
        THEN (SELECT coalesce(sum(i.qty), 0)::int FROM ${teamOrderItems} i WHERE i.order_id = ${teamOrders.id})
        ELSE (SELECT coalesce(sum(ql.qty), 0)::int FROM ${quoteLines} ql WHERE ql.quote_id = ${latestQuote}) END`,
      supplierNames: sql<string[]>`coalesce((SELECT array_agg(DISTINCT ${teamOrderItems.supplierName} ORDER BY ${teamOrderItems.supplierName}) FROM ${teamOrderItems} WHERE ${teamOrderItems.orderId} = ${teamOrders.id}), '{}')`,
      // The latest quote that still counts, or the request's own prices before any quote.
      totalIls: sql<number>`coalesce((
        SELECT q.shipping_ils + coalesce((SELECT sum(ql.qty * ql.unit_price_ils) FROM ${quoteLines} ql WHERE ql.quote_id = q.id), 0)
        FROM ${quotes} q WHERE q.order_id = ${teamOrders.id} AND q.status <> 'superseded'
        ORDER BY q.version DESC LIMIT 1
      ), (SELECT sum(i.qty * i.unit_price_ils) FROM ${teamOrderItems} i WHERE i.order_id = ${teamOrders.id}), 0)::int`,
    })
    .from(teamOrders)
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .orderBy(asc(teamOrders.submittedAt));

  const approved = rows.filter((r) => r.status === "approved").map((r) => r.id);
  const [lines, money] = await Promise.all([getOrderLines(approved), getMoneyByOrder(rows.map((r) => r.id))]);
  const byOrder = new Map<string, typeof lines>();
  for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]);

  const all = rows.map(({ teamProgram, teamNumber, ...r }) => {
    const facts = byOrder.get(r.id) ?? [];
    const vendors = new Map(facts.filter((l) => l.quoted > l.ordered).map((l) => [l.supplierId, l.supplierName]));
    return {
      ...r,
      teamLabel: `${teamProgram} ${teamNumber}`,
      teamDisplay: teamDisplay({ name: r.teamName, program: teamProgram, number: teamNumber }),
      teamNumber,
      teamProgram,
      vendorsToOrder: [...vendors].map(([id, name]) => ({ id, name })),
      view: orderStatus(r.status, facts as LineFacts[]),
      money: money.get(r.id)?.money ?? { owed: 0, paid: 0, left: 0, over: 0, state: "none" as const },
    };
  });
  return sortForAdmin(all);
}

/** How many orders are in each open status, for the filter boxes and the tab badges. */
export function countByStatus(orders: AdminOrderSummary[]) {
  const counts = Object.fromEntries(ORDER_STATUS_KEYS.map((s) => [s, 0])) as Record<OrderStatusKey, number>;
  for (const o of orders) counts[o.view.status]++;
  return counts;
}

/** Everything an open card needs about its lines' supplier orders, shipments and receipts. */
export async function getOrderLogistics(orderId: string) {
  const items = await db
    .select({ id: teamOrderItems.id })
    .from(teamOrderItems)
    .where(eq(teamOrderItems.orderId, orderId));
  const itemIds = items.map((i) => i.id);
  if (itemIds.length === 0) return { pos: [], lines: [], shipments: [], others: [], ready: [] };

  const lines = await db
    .select({
      // Filtered to this order's items below, so never null.
      orderItemId: sql<string>`${poAllocations.orderItemId}`,
      qty: poAllocations.qty,
      poLineId: poLines.id,
      poId: supplierPos.id,
      poNumber: supplierPos.number,
      poStatus: supplierPos.status,
      supplierOrderRef: supplierPos.supplierOrderRef,
      orderedAt: supplierPos.orderedAt,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      received: sql<number>`(SELECT coalesce(sum(qty_received), 0)::int FROM ${receiptLines} WHERE ${receiptLines.poLineId} = ${poLines.id})`,
      damaged: sql<number>`(SELECT coalesce(sum(qty_damaged), 0)::int FROM ${receiptLines} WHERE ${receiptLines.poLineId} = ${poLines.id})`,
    })
    .from(poAllocations)
    .innerJoin(poLines, eq(poLines.id, poAllocations.poLineId))
    .innerJoin(supplierPos, and(eq(supplierPos.id, poLines.poId), ne(supplierPos.status, "cancelled")))
    .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
    .where(inArray(poAllocations.orderItemId, itemIds));

  const poIds = [...new Set(lines.map((l) => l.poId))];
  const [shipmentRows, others] = poIds.length
    ? await Promise.all([
        db
          .select({
            id: shipments.id,
            number: shipments.number,
            poId: shipments.poId,
            carrier: shipments.carrier,
            tracking: shipments.tracking,
            // Spelled out: in a one-table select drizzle writes ${shipments.id} as a bare "id", which the
            // subquery reads as its own (the old EXISTS matched a receipt to itself, so shipments stayed "בדרך").
            shipped: sql<number>`(SELECT coalesce(sum(si.qty), 0)::int FROM shipment_items si WHERE si.shipment_id = shipments.id)`,
            received: sql<number>`(SELECT coalesce(sum(rl.qty_received), 0)::int FROM receipt_lines rl JOIN receipts r ON r.id = rl.receipt_id WHERE r.shipment_id = shipments.id)`,
          })
          .from(shipments)
          .where(inArray(shipments.poId, poIds))
          .orderBy(asc(shipments.number)),
        // The other team orders each of these supplier orders serves.
        db
          .selectDistinct({
            poId: poLines.poId,
            orderId: teamOrders.id,
            orderNumber: teamOrders.number,
            teamProgram: teams.program,
            teamNumber: teams.number,
          })
          .from(poAllocations)
          .innerJoin(poLines, eq(poLines.id, poAllocations.poLineId))
          .innerJoin(teamOrderItems, eq(teamOrderItems.id, poAllocations.orderItemId))
          .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
          .innerJoin(teams, eq(teams.id, teamOrders.teamId))
          .where(and(inArray(poLines.poId, poIds), ne(teamOrders.id, orderId))),
      ])
    : [[], []];

  const ready = await db
    .select({
      allocationId: stockAllocations.id,
      // Filtered to this order's items below, so never null.
      orderItemId: sql<string>`${stockAllocations.orderItemId}`,
      qty: stockAllocations.qty,
      onNotes: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${deliveryItems} WHERE ${deliveryItems.allocationId} = ${stockAllocations.id})`,
      location: receiptLines.location,
    })
    .from(stockAllocations)
    .innerJoin(receiptLines, eq(receiptLines.id, stockAllocations.receiptLineId))
    .where(inArray(stockAllocations.orderItemId, itemIds));

  const pos = poIds.map((id) => {
    const first = lines.find((l) => l.poId === id)!;
    return {
      id,
      number: first.poNumber,
      status: first.poStatus,
      supplierId: first.supplierId,
      supplierName: first.supplierName,
      supplierOrderRef: first.supplierOrderRef,
      orderedAt: first.orderedAt,
      others: others.filter((o) => o.poId === id),
    };
  });

  return { pos, lines, shipments: shipmentRows, others, ready: ready.filter((r) => r.qty > r.onNotes) };
}

/** When each stage happened, for a finished order's summary. */
export async function getOrderDates(orderId: string) {
  const {
    rows: [row],
  } = await db.execute<{
    quote_sent: string | null;
    approved: string | null;
    ordered: string | null;
    received: string | null;
    delivered: string | null;
  }>(sql`
    SELECT
      (SELECT min(sent_at) FROM ${quotes} WHERE order_id = ${orderId}) AS quote_sent,
      (SELECT max(qa.at) FROM quote_approvals qa JOIN ${quotes} q ON q.id = qa.quote_id WHERE q.order_id = ${orderId}) AS approved,
      (SELECT max(p.ordered_at) FROM ${poAllocations} a JOIN ${poLines} l ON l.id = a.po_line_id
        JOIN ${supplierPos} p ON p.id = l.po_id JOIN ${teamOrderItems} i ON i.id = a.order_item_id
        WHERE i.order_id = ${orderId} AND p.status = 'ordered') AS ordered,
      (SELECT max(r.received_at) FROM ${stockAllocations} sa JOIN ${receiptLines} rl ON rl.id = sa.receipt_line_id
        JOIN ${receipts} r ON r.id = rl.receipt_id JOIN ${teamOrderItems} i ON i.id = sa.order_item_id
        WHERE i.order_id = ${orderId}) AS received,
      (SELECT max(d.delivered_at) FROM ${deliveryItems} di JOIN ${deliveries} d ON d.id = di.delivery_id
        JOIN ${stockAllocations} sa ON sa.id = di.allocation_id JOIN ${teamOrderItems} i ON i.id = sa.order_item_id
        WHERE i.order_id = ${orderId}) AS delivered
  `);
  const at = (v: string | null) => (v ? new Date(v) : null);
  return {
    quoteSent: at(row?.quote_sent ?? null),
    approved: at(row?.approved ?? null),
    ordered: at(row?.ordered ?? null),
    received: at(row?.received ?? null),
    delivered: at(row?.delivered ?? null),
  };
}
