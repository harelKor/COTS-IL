import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const {
  deliveries,
  deliveryItems,
  poAllocations,
  poLines,
  quoteLines,
  quotes,
  receiptLines,
  receipts,
  shipmentItems,
  stockAllocations,
  supplierPos,
  teamOrderItems,
  teamOrders,
  teams,
} = schema;

/**
 * Every approved line with where its units are: the one source for `orderStatus` and
 * `lineStatus` in src/domain/order-status.ts, on every screen. One query for any number of
 * orders (all of them when `orderIds` is left out). Teams only ever pass their own order.
 */
export async function getOrderLines(orderIds?: string[]) {
  if (orderIds && orderIds.length === 0) return [];
  return db
    .select({
      orderItemId: teamOrderItems.id,
      orderId: teamOrders.id,
      orderNumber: teamOrders.number,
      teamName: teams.name,
      teamProgram: teams.program,
      teamNumber: teams.number,
      title: teamOrderItems.title,
      supplierName: teamOrderItems.supplierName,
      supplierId: sql<string>`(SELECT v.supplier_id FROM variants v WHERE v.id = ${teamOrderItems.variantId})`,
      supplierSku: teamOrderItems.supplierSku,
      options: teamOrderItems.options,
      quoted: quoteLines.qty,
      ordered: sql<number>`(
        SELECT coalesce(sum(a.qty), 0)::int FROM ${poAllocations} a
        JOIN ${poLines} l ON l.id = a.po_line_id JOIN ${supplierPos} p ON p.id = l.po_id
        WHERE a.order_item_id = ${teamOrderItems.id} AND p.status = 'ordered'
      )`,
      /** On any supplier order that isn't cancelled, drafts included. */
      onBatch: sql<number>`(
        SELECT coalesce(sum(a.qty), 0)::int FROM ${poAllocations} a
        JOIN ${poLines} l ON l.id = a.po_line_id JOIN ${supplierPos} p ON p.id = l.po_id
        WHERE a.order_item_id = ${teamOrderItems.id} AND p.status <> 'cancelled'
      )`,
      inTransit: sql<boolean>`EXISTS (
        SELECT 1 FROM ${poAllocations} a
        JOIN ${shipmentItems} si ON si.po_line_id = a.po_line_id
        WHERE a.order_item_id = ${teamOrderItems.id} AND si.qty > (
          SELECT coalesce(sum(rl.qty_received), 0) FROM ${receiptLines} rl
          JOIN ${receipts} r ON r.id = rl.receipt_id
          WHERE r.shipment_id = si.shipment_id AND rl.po_line_id = si.po_line_id
        )
      )`,
      allocated: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${stockAllocations} WHERE ${stockAllocations.orderItemId} = ${teamOrderItems.id})`,
      prepared: sql<number>`(
        SELECT coalesce(sum(di.qty), 0)::int FROM ${deliveryItems} di
        JOIN ${stockAllocations} sa ON sa.id = di.allocation_id JOIN ${deliveries} d ON d.id = di.delivery_id
        WHERE sa.order_item_id = ${teamOrderItems.id} AND d.status = 'prepared'
      )`,
      delivered: sql<number>`(
        SELECT coalesce(sum(di.qty), 0)::int FROM ${deliveryItems} di
        JOIN ${stockAllocations} sa ON sa.id = di.allocation_id JOIN ${deliveries} d ON d.id = di.delivery_id
        WHERE sa.order_item_id = ${teamOrderItems.id} AND d.status = 'delivered'
      )`,
    })
    .from(quoteLines)
    .innerJoin(quotes, and(eq(quotes.id, quoteLines.quoteId), eq(quotes.status, "approved")))
    .innerJoin(teamOrders, eq(teamOrders.id, quotes.orderId))
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, quoteLines.itemId))
    .where(orderIds ? inArray(teamOrders.id, orderIds) : undefined)
    .orderBy(asc(teamOrders.number), asc(teamOrderItems.title));
}

export type OrderLine = Awaited<ReturnType<typeof getOrderLines>>[number];
