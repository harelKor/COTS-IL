import "server-only";
import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Viewer } from "@/lib/auth";

const {
  deliveries,
  deliveryItems,
  importCosts,
  poAllocations,
  poLines,
  quoteLines,
  quotes,
  receiptLines,
  receipts,
  shipmentItems,
  shipments,
  stockAllocations,
  supplierPos,
  suppliers,
  teamOrderItems,
  teamOrders,
  teams,
} = schema;

export async function listShipments() {
  return db
    .select({
      id: shipments.id,
      number: shipments.number,
      carrier: shipments.carrier,
      tracking: shipments.tracking,
      createdAt: shipments.createdAt,
      poId: supplierPos.id,
      poNumber: supplierPos.number,
      supplierName: suppliers.name,
      shipped: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${shipmentItems} WHERE ${shipmentItems.shipmentId} = ${shipments.id})`,
      received: sql<number>`(SELECT coalesce(sum(l.qty_received), 0)::int FROM ${receiptLines} l JOIN ${receipts} r ON r.id = l.receipt_id WHERE r.shipment_id = ${shipments.id})`,
    })
    .from(shipments)
    .innerJoin(supplierPos, eq(supplierPos.id, shipments.poId))
    .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
    .orderBy(desc(shipments.number));
}

/** A supplier order's shipments, and how much of each line has shipped. */
export async function getPoShipping(poId: string) {
  const list = await db
    .select({
      ...getTableColumns(shipments),
      // Spelled out: in a one-table select drizzle writes ${shipments.id} as a bare "id", which the subquery would read as its own.
      shipped: sql<number>`(SELECT coalesce(sum(si.qty), 0)::int FROM shipment_items si WHERE si.shipment_id = shipments.id)`,
      received: sql<number>`(SELECT coalesce(sum(l.qty_received), 0)::int FROM receipt_lines l JOIN receipts r ON r.id = l.receipt_id WHERE r.shipment_id = shipments.id)`,
    })
    .from(shipments)
    .where(eq(shipments.poId, poId))
    .orderBy(asc(shipments.number));
  const shippedRows = await db
    .select({ poLineId: shipmentItems.poLineId, qty: sql<number>`sum(${shipmentItems.qty})::int` })
    .from(shipmentItems)
    .innerJoin(shipments, eq(shipments.id, shipmentItems.shipmentId))
    .where(eq(shipments.poId, poId))
    .groupBy(shipmentItems.poLineId);
  const damagedRows = await db
    .select({ poLineId: receiptLines.poLineId, qty: sql<number>`sum(${receiptLines.qtyDamaged})::int` })
    .from(receiptLines)
    .innerJoin(poLines, eq(poLines.id, receiptLines.poLineId))
    .where(eq(poLines.poId, poId))
    .groupBy(receiptLines.poLineId);
  const damaged = new Map(damagedRows.map((r) => [r.poLineId, r.qty]));
  // Damaged units can be shipped again as replacements, so they count as still to come.
  const toShip = new Map(shippedRows.map((r) => [r.poLineId, r.qty - (damaged.get(r.poLineId) ?? 0)]));
  return { shipments: list, shipped: toShip };
}

export async function getShipment(id: string) {
  if (!z.uuid().safeParse(id).success) return null;

  const [row] = await db
    .select({ shipment: shipments, po: supplierPos, supplierName: suppliers.name })
    .from(shipments)
    .innerJoin(supplierPos, eq(supplierPos.id, shipments.poId))
    .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
    .where(eq(shipments.id, id));
  if (!row) return null;

  const items = await db
    .select({
      poLineId: shipmentItems.poLineId,
      shipped: shipmentItems.qty,
      supplierSku: poLines.supplierSku,
      title: poLines.title,
      options: poLines.options,
    })
    .from(shipmentItems)
    .innerJoin(poLines, eq(poLines.id, shipmentItems.poLineId))
    .where(eq(shipmentItems.shipmentId, id))
    .orderBy(asc(poLines.title));

  const receiptRows = await db
    .select({
      receiptId: receipts.id,
      receivedAt: receipts.receivedAt,
      notes: receipts.notes,
      lineId: receiptLines.id,
      poLineId: receiptLines.poLineId,
      qtyReceived: receiptLines.qtyReceived,
      qtyDamaged: receiptLines.qtyDamaged,
      location: receiptLines.location,
    })
    .from(receiptLines)
    .innerJoin(receipts, eq(receipts.id, receiptLines.receiptId))
    .where(eq(receipts.shipmentId, id))
    .orderBy(asc(receipts.receivedAt));

  const lineIds = items.map((i) => i.poLineId);
  const shares = lineIds.length ? await getShares(lineIds) : [];
  const allocations = receiptRows.length
    ? await db
        .select({
          id: stockAllocations.id,
          receiptLineId: stockAllocations.receiptLineId,
          orderItemId: stockAllocations.orderItemId,
          qty: stockAllocations.qty,
          delivered: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${deliveryItems} WHERE ${deliveryItems.allocationId} = ${stockAllocations.id})`,
        })
        .from(stockAllocations)
        .where(
          inArray(
            stockAllocations.receiptLineId,
            receiptRows.map((r) => r.lineId),
          ),
        )
    : [];

  const costs = await db.select().from(importCosts).where(eq(importCosts.shipmentId, id)).orderBy(asc(importCosts.createdAt));

  return { ...row, items, receiptRows, shares, allocations, costs };
}

/** Each team's share of supplier order lines, with what it has already been allocated. */
export async function getShares(poLineIds: string[], reader: Pick<typeof db, "select"> = db) {
  return reader
    .select({
      poLineId: poAllocations.poLineId,
      orderItemId: poAllocations.orderItemId,
      share: poAllocations.qty,
      orderNumber: teamOrders.number,
      teamProgram: teams.program,
      teamNumber: teams.number,
      allocated: sql<number>`(
        SELECT coalesce(sum(sa.qty), 0)::int FROM ${stockAllocations} sa
        JOIN ${receiptLines} rl ON rl.id = sa.receipt_line_id
        WHERE sa.order_item_id = ${poAllocations.orderItemId} AND rl.po_line_id = ${poAllocations.poLineId}
      )`,
    })
    .from(poAllocations)
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, poAllocations.orderItemId))
    .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .where(inArray(poAllocations.poLineId, poLineIds))
    .orderBy(asc(teamOrders.number));
}

/** Allocated units not yet on any delivery, for the delivery board. */
export async function getReadyToDeliver() {
  const rows = await db
    .select({
      allocationId: stockAllocations.id,
      qty: stockAllocations.qty,
      delivered: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${deliveryItems} WHERE ${deliveryItems.allocationId} = ${stockAllocations.id})`,
      location: receiptLines.location,
      title: teamOrderItems.title,
      supplierSku: teamOrderItems.supplierSku,
      options: teamOrderItems.options,
      orderNumber: teamOrders.number,
      deliveryMethod: teamOrders.deliveryMethod,
      address: teamOrders.address,
      teamId: teams.id,
      teamName: teams.name,
      teamProgram: teams.program,
      teamNumber: teams.number,
    })
    .from(stockAllocations)
    .innerJoin(receiptLines, eq(receiptLines.id, stockAllocations.receiptLineId))
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, stockAllocations.orderItemId))
    .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .orderBy(asc(teams.number), asc(teamOrders.number));
  return rows.filter((r) => r.qty > r.delivered);
}

/**
 * Delivery notes not confirmed yet, with their lines (A-02). Their units already left the
 * board above, but they are still the admin's to hand over, so "ready" lists them too.
 */
export async function getOpenDeliveries() {
  const notes = await db
    .select({
      id: deliveries.id,
      number: deliveries.number,
      method: deliveries.method,
      address: deliveries.address,
      createdAt: deliveries.createdAt,
      teamId: teams.id,
      teamName: teams.name,
      teamProgram: teams.program,
      teamNumber: teams.number,
    })
    .from(deliveries)
    .innerJoin(teams, eq(teams.id, deliveries.teamId))
    .where(eq(deliveries.status, "prepared"))
    .orderBy(asc(teams.number), asc(deliveries.number));
  if (notes.length === 0) return [];
  const items = await db
    .select({
      deliveryId: deliveryItems.deliveryId,
      allocationId: deliveryItems.allocationId,
      qty: deliveryItems.qty,
      title: teamOrderItems.title,
      supplierSku: teamOrderItems.supplierSku,
      options: teamOrderItems.options,
      orderNumber: teamOrders.number,
      contactName: teamOrders.contactName,
    })
    .from(deliveryItems)
    .innerJoin(stockAllocations, eq(stockAllocations.id, deliveryItems.allocationId))
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, stockAllocations.orderItemId))
    .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
    .where(inArray(deliveryItems.deliveryId, notes.map((n) => n.id)))
    .orderBy(asc(teamOrders.number), asc(teamOrderItems.title));
  return notes.map((n) => {
    const lines = items.filter((i) => i.deliveryId === n.id);
    return { ...n, items: lines, contactName: lines[0]?.contactName ?? "" };
  });
}

export async function listDeliveries() {
  return db
    .select({ delivery: deliveries, teamName: teams.name, teamProgram: teams.program, teamNumber: teams.number })
    .from(deliveries)
    .innerJoin(teams, eq(teams.id, deliveries.teamId))
    .orderBy(desc(deliveries.number));
}

/** A delivery note, or null when it doesn't exist or belongs to another team (AT-02). */
export async function getDeliveryForViewer(id: string, viewer: Viewer) {
  if (!z.uuid().safeParse(id).success) return null;

  const [row] = await db
    .select({ delivery: deliveries, team: teams })
    .from(deliveries)
    .innerJoin(teams, eq(teams.id, deliveries.teamId))
    .where(eq(deliveries.id, id));
  if (!row) return null;
  if (!viewer.isAdmin && !viewer.teams.some((t) => t.id === row.delivery.teamId)) return null;

  const items = await db
    .select({
      allocationId: deliveryItems.allocationId,
      qty: deliveryItems.qty,
      orderItemId: teamOrderItems.id,
      title: teamOrderItems.title,
      supplierName: teamOrderItems.supplierName,
      supplierSku: teamOrderItems.supplierSku,
      options: teamOrderItems.options,
      orderId: teamOrders.id,
      orderNumber: teamOrders.number,
      quoted: sql<number>`coalesce((
        SELECT ql.qty FROM ${quoteLines} ql JOIN ${quotes} q ON q.id = ql.quote_id
        WHERE ql.item_id = ${teamOrderItems.id} AND q.status = 'approved'
      ), ${teamOrderItems.qty})`,
      deliveredTotal: sql<number>`(
        SELECT coalesce(sum(di.qty), 0)::int FROM ${deliveryItems} di
        JOIN ${stockAllocations} sa ON sa.id = di.allocation_id
        WHERE sa.order_item_id = ${teamOrderItems.id}
      )`,
    })
    .from(deliveryItems)
    .innerJoin(stockAllocations, eq(stockAllocations.id, deliveryItems.allocationId))
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, stockAllocations.orderItemId))
    .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
    .where(eq(deliveryItems.deliveryId, id))
    .orderBy(asc(teamOrders.number), asc(teamOrderItems.title));

  return { ...row, items };
}

/** Supplier order lines against what actually arrived, for the shortage report. */
export async function getSupplierShortages() {
  return db
    .select({
      poId: supplierPos.id,
      poNumber: supplierPos.number,
      supplierName: suppliers.name,
      supplierSku: poLines.supplierSku,
      title: poLines.title,
      ordered: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${poAllocations} WHERE ${poAllocations.poLineId} = ${poLines.id})`,
      shipped: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${shipmentItems} WHERE ${shipmentItems.poLineId} = ${poLines.id})`,
      received: sql<number>`(SELECT coalesce(sum(qty_received), 0)::int FROM ${receiptLines} WHERE ${receiptLines.poLineId} = ${poLines.id})`,
      damaged: sql<number>`(SELECT coalesce(sum(qty_damaged), 0)::int FROM ${receiptLines} WHERE ${receiptLines.poLineId} = ${poLines.id})`,
    })
    .from(poLines)
    .innerJoin(supplierPos, and(eq(supplierPos.id, poLines.poId), eq(supplierPos.status, "ordered")))
    .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
    .orderBy(asc(supplierPos.number), asc(poLines.title));
}

/** Deliveries that include an order's lines, for the team's order page. */
export async function getOrderDeliveries(orderId: string) {
  return db
    .selectDistinct({
      id: deliveries.id,
      number: deliveries.number,
      status: deliveries.status,
      method: deliveries.method,
      deliveredAt: deliveries.deliveredAt,
    })
    .from(deliveries)
    .innerJoin(deliveryItems, eq(deliveryItems.deliveryId, deliveries.id))
    .innerJoin(stockAllocations, eq(stockAllocations.id, deliveryItems.allocationId))
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, stockAllocations.orderItemId))
    .where(eq(teamOrderItems.orderId, orderId))
    .orderBy(asc(deliveries.number));
}
