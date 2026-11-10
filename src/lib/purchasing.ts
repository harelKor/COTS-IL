import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { DemandRow } from "@/domain/purchasing";

const { poAllocations, poLines, products, quoteLines, quotes, supplierPos, suppliers, teamOrderItems, teamOrders, teams, variants } =
  schema;

type Reader = Pick<typeof db, "select">;

/** Units of an order line already on a supplier order that isn't cancelled. */
export const allocatedQty = sql<number>`coalesce((
  SELECT sum(a.qty)::int FROM ${poAllocations} a
  JOIN ${poLines} l ON l.id = a.po_line_id
  JOIN ${supplierPos} p ON p.id = l.po_id
  WHERE a.order_item_id = ${teamOrderItems.id} AND p.status <> 'cancelled'
), 0)`;

function demandQuery(reader: Reader) {
  return reader
    .select({
      orderItemId: teamOrderItems.id,
      orderId: teamOrders.id,
      submittedAt: teamOrders.submittedAt,
      orderNumber: teamOrders.number,
      teamProgram: teams.program,
      teamNumber: teams.number,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      platform: suppliers.platform,
      variantId: variants.id,
      supplierVariantId: variants.supplierVariantId,
      supplierSku: variants.supplierSku,
      title: products.title,
      options: variants.options,
      productUrl: products.url,
      livePriceUsd: variants.priceUsd,
      requestedPriceUsd: teamOrderItems.priceUsd,
      quotedQty: quoteLines.qty,
      allocatedQty,
    })
    .from(quoteLines)
    .innerJoin(quotes, and(eq(quotes.id, quoteLines.quoteId), eq(quotes.status, "approved")))
    .innerJoin(teamOrders, and(eq(teamOrders.id, quotes.orderId), eq(teamOrders.status, "approved")))
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, quoteLines.itemId))
    .innerJoin(variants, eq(variants.id, teamOrderItems.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .orderBy(asc(teamOrders.number));
}

type DemandResult = Awaited<ReturnType<typeof demandQuery>>[number];

function toDemandRow(row: DemandResult): DemandRow {
  return {
    ...row,
    teamLabel: `${row.teamProgram} ${row.teamNumber}`,
    costUsd: row.livePriceUsd ?? row.requestedPriceUsd,
  };
}

/** Approved quote lines, with what's already on a supplier order. Empty needs are filtered later. */
export async function getDemand(): Promise<DemandRow[]> {
  return (await demandQuery(db)).map(toDemandRow);
}

/** The same, locking the orders, so a re-quote can't change them while a supplier order is built. */
export async function getDemandForUpdate(reader: Reader): Promise<DemandRow[]> {
  return (await demandQuery(reader).for("update", { of: teamOrders })).map(toDemandRow);
}

export async function listPos() {
  return db
    .select({
      id: supplierPos.id,
      number: supplierPos.number,
      status: supplierPos.status,
      supplierName: suppliers.name,
      supplierOrderRef: supplierPos.supplierOrderRef,
      orderedAt: supplierPos.orderedAt,
      createdAt: supplierPos.createdAt,
      lineCount: sql<number>`(SELECT count(*)::int FROM ${poLines} WHERE ${poLines.poId} = ${supplierPos.id})`,
      unitCount: sql<number>`(SELECT coalesce(sum(a.qty), 0)::int FROM ${poAllocations} a JOIN ${poLines} l ON l.id = a.po_line_id WHERE l.po_id = ${supplierPos.id})`,
      linesUsd: sql<number>`(SELECT coalesce(sum(a.qty * coalesce(l.unit_cost_usd, 0)), 0)::float FROM ${poAllocations} a JOIN ${poLines} l ON l.id = a.po_line_id WHERE l.po_id = ${supplierPos.id})`,
      /** The last change on record (lines added or removed, ordered, record fields), or creation. */
      updatedAt: sql<Date>`greatest(${supplierPos.createdAt}, ${supplierPos.orderedAt}, (SELECT max(at) FROM audit_log WHERE entity = 'supplier_po' AND entity_id = ${supplierPos.id}::text))`.mapWith(
        (v: string | Date) => new Date(v),
      ),
    })
    .from(supplierPos)
    .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
    .orderBy(desc(supplierPos.number));
}

/** The last change on record for one supplier order (see `updatedAt` in listPos). */
export async function getPoUpdatedAt(po: { id: string; createdAt: Date; orderedAt: Date | null }): Promise<Date> {
  const [row] = await db
    .select({ at: sql<string | null>`max(${schema.auditLog.at})` })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.entity, "supplier_po"), eq(schema.auditLog.entityId, po.id)));
  const times = [po.createdAt, po.orderedAt, row?.at ? new Date(row.at) : null].filter((d): d is Date => !!d);
  return new Date(Math.max(...times.map((d) => d.getTime())));
}

export async function getPo(id: string) {
  if (!z.uuid().safeParse(id).success) return null;

  const [row] = await db
    .select({ po: supplierPos, supplier: suppliers })
    .from(supplierPos)
    .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
    .where(eq(supplierPos.id, id));
  if (!row) return null;

  const lines = await db.select().from(poLines).where(eq(poLines.poId, id)).orderBy(asc(poLines.title));

  const allocations = await db
    .select({
      poLineId: poAllocations.poLineId,
      qty: poAllocations.qty,
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
    .where(eq(poLines.poId, id))
    .orderBy(asc(teamOrders.number));

  return {
    ...row,
    lines: lines.map((line) => {
      const shares = allocations.filter((a) => a.poLineId === line.id);
      return { ...line, allocations: shares, qty: shares.reduce((sum, a) => sum + a.qty, 0) };
    }),
  };
}

/**
 * Where an order's lines are on supplier orders: `ordered` when any is on one marked
 * ordered (the quote is locked for good, S13), `draft` when only on drafts (remove them
 * there first), or null.
 */
export async function orderSupplierLock(reader: Reader, orderId: string): Promise<"ordered" | "draft" | null> {
  const rows = await reader
    .select({ status: supplierPos.status })
    .from(poAllocations)
    .innerJoin(poLines, eq(poLines.id, poAllocations.poLineId))
    .innerJoin(supplierPos, and(eq(supplierPos.id, poLines.poId), ne(supplierPos.status, "cancelled")))
    .innerJoin(teamOrderItems, eq(teamOrderItems.id, poAllocations.orderItemId))
    .where(eq(teamOrderItems.orderId, orderId));
  if (rows.some((r) => r.status === "ordered")) return "ordered";
  return rows.length > 0 ? "draft" : null;
}

/** What the teams were quoted, in shekels, for the units this supplier order buys for them. */
export async function getPoRevenueIls(poId: string): Promise<number> {
  const {
    rows: [row],
  } = await db.execute<{ ils: number }>(sql`
    SELECT coalesce(sum(a.qty * ql.unit_price_ils), 0)::int AS ils
    FROM po_allocations a
    JOIN po_lines l ON l.id = a.po_line_id
    JOIN quote_lines ql ON ql.item_id = a.order_item_id
    JOIN quotes q ON q.id = ql.quote_id AND q.status = 'approved'
    WHERE l.po_id = ${poId}
  `);
  return row?.ils ?? 0;
}
