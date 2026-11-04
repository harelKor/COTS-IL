import "server-only";
import { and, asc, desc, eq, gte, lte, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

const {
  importCosts,
  poAllocations,
  poLines,
  quoteApprovals,
  quoteLines,
  quotes,
  shipments,
  supplierPos,
  suppliers,
  syncJobs,
  teamOrderItems,
  teamOrders,
  teams,
} = schema;

export type ReportPeriod = { from?: string; to?: string };

const day = z.iso.date();

export function parsePeriod(params: Record<string, string | string[] | undefined>): ReportPeriod {
  const read = (key: string) => {
    const parsed = day.safeParse(params[key]);
    return parsed.success ? parsed.data : undefined;
  };
  return { from: read("from"), to: read("to") };
}

/** Whole Israeli days. Summer time is an hour off at the very edges, which doesn't matter for these reports. */
function inPeriod(column: Parameters<typeof gte>[0], { from, to }: ReportPeriod): (SQL | undefined)[] {
  return [
    from ? gte(column, new Date(`${from}T00:00:00+02:00`)) : undefined,
    to ? lte(column, new Date(`${to}T23:59:59+02:00`)) : undefined,
  ];
}

/** Approved orders submitted in the period, with money and timing. */
export async function getSales(period: ReportPeriod) {
  return db
    .select({
      orderId: teamOrders.id,
      number: teamOrders.number,
      teamProgram: teams.program,
      teamNumber: teams.number,
      teamName: teams.name,
      submittedAt: teamOrders.submittedAt,
      firstQuoteAt: sql<Date | null>`(SELECT min(q.sent_at) FROM ${quotes} q WHERE q.order_id = ${teamOrders.id})`.mapWith((v) =>
        v ? new Date(v) : null,
      ),
      approvedAt: sql<Date | null>`(SELECT max(a.at) FROM ${quoteApprovals} a WHERE a.quote_id = ${quotes.id})`.mapWith((v) =>
        v ? new Date(v) : null,
      ),
      subtotalIls: sql<number>`(SELECT coalesce(sum(l.qty * l.unit_price_ils), 0)::int FROM ${quoteLines} l WHERE l.quote_id = ${quotes.id})`,
      shippingIls: quotes.shippingIls,
      quotedUnits: sql<number>`(SELECT coalesce(sum(l.qty), 0)::int FROM ${quoteLines} l WHERE l.quote_id = ${quotes.id})`,
      boughtUnits: sql<number>`(
        SELECT coalesce(sum(a.qty), 0)::int FROM ${poAllocations} a
        JOIN ${poLines} pl ON pl.id = a.po_line_id
        JOIN ${supplierPos} p ON p.id = pl.po_id
        JOIN ${teamOrderItems} i ON i.id = a.order_item_id
        WHERE i.order_id = ${teamOrders.id} AND p.status = 'ordered'
      )`,
      purchaseUsd: sql<number>`(
        SELECT coalesce(sum(a.qty * pl.unit_cost_usd), 0)::float FROM ${poAllocations} a
        JOIN ${poLines} pl ON pl.id = a.po_line_id
        JOIN ${supplierPos} p ON p.id = pl.po_id
        JOIN ${teamOrderItems} i ON i.id = a.order_item_id
        WHERE i.order_id = ${teamOrders.id} AND p.status = 'ordered'
      )`,
    })
    .from(teamOrders)
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .innerJoin(quotes, and(eq(quotes.orderId, teamOrders.id), eq(quotes.status, "approved")))
    .where(and(eq(teamOrders.status, "approved"), ...inPeriod(teamOrders.submittedAt, period)))
    .orderBy(asc(teamOrders.number));
}

/** Supplier orders placed in the period. */
export async function getPurchases(period: ReportPeriod) {
  return db
    .select({
      id: supplierPos.id,
      number: supplierPos.number,
      supplierName: suppliers.name,
      supplierOrderRef: supplierPos.supplierOrderRef,
      orderedAt: supplierPos.orderedAt,
      units: sql<number>`(
        SELECT coalesce(sum(a.qty), 0)::int FROM ${poAllocations} a
        JOIN ${poLines} pl ON pl.id = a.po_line_id WHERE pl.po_id = ${supplierPos.id}
      )`,
      totalUsd: sql<number>`(
        SELECT coalesce(sum(a.qty * pl.unit_cost_usd), 0)::float FROM ${poAllocations} a
        JOIN ${poLines} pl ON pl.id = a.po_line_id WHERE pl.po_id = ${supplierPos.id}
      )`,
    })
    .from(supplierPos)
    .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
    .where(and(eq(supplierPos.status, "ordered"), ...inPeriod(supplierPos.orderedAt, period)))
    .orderBy(asc(supplierPos.number));
}

/** Import costs recorded in the period. */
export async function getImportCosts(period: ReportPeriod) {
  const rows = await db
    .select({
      id: importCosts.id,
      type: importCosts.type,
      amountIls: importCosts.amountIls,
      vatReclaimable: importCosts.vatReclaimable,
      reference: importCosts.reference,
      createdAt: importCosts.createdAt,
      shipmentNumber: shipments.number,
      shipmentId: shipments.id,
      supplierName: suppliers.name,
    })
    .from(importCosts)
    .innerJoin(shipments, eq(shipments.id, importCosts.shipmentId))
    .innerJoin(supplierPos, eq(supplierPos.id, shipments.poId))
    .innerJoin(suppliers, eq(suppliers.id, supplierPos.supplierId))
    .where(and(...inPeriod(importCosts.createdAt, period)))
    .orderBy(asc(importCosts.createdAt));
  return rows.map((row) => ({ ...row, amountIls: Number(row.amountIls) }));
}

/** The latest sync run and last success for each supplier that syncs. */
export async function getSyncStatus() {
  const rows = await db
    .selectDistinctOn([suppliers.id], {
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      status: syncJobs.status,
      startedAt: syncJobs.startedAt,
      error: syncJobs.error,
    })
    .from(suppliers)
    .leftJoin(syncJobs, eq(syncJobs.supplierId, suppliers.id))
    .where(and(eq(suppliers.active, true), eq(suppliers.platform, "shopify")))
    .orderBy(suppliers.id, desc(syncJobs.startedAt));

  const successes = await db
    .select({ supplierId: syncJobs.supplierId, at: sql<string>`max(${syncJobs.finishedAt})` })
    .from(syncJobs)
    .where(eq(syncJobs.status, "succeeded"))
    .groupBy(syncJobs.supplierId);
  const lastSuccess = new Map(successes.map((s) => [s.supplierId, new Date(s.at)]));

  return rows
    .map((row) => ({ ...row, lastSuccessAt: lastSuccess.get(row.supplierId) ?? null }))
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}
