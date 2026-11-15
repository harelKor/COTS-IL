import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { cancelPlan, type CancelLine } from "@/domain/order-corrections";
import { teamDisplay } from "@/domain/display";
import { describeHistory } from "@/domain/order-history";

const { auditLog, profiles, teams } = schema;

type Reader = Pick<typeof db, "execute">;

/** Where each of an order's lines' units are, for cancelling it (cancelPlan in src/domain/order-corrections.ts). */
export async function getCancelLines(reader: Reader, orderId: string): Promise<CancelLine[]> {
  const { rows } = await reader.execute<{
    item_id: string;
    label: string;
    on_draft: number;
    ordered: number;
    shipped: number;
    received: number;
    prepared: number;
    delivered: number;
  }>(sql`
    SELECT i.id AS item_id, coalesce(i.supplier_sku, i.title) AS label,
      (SELECT coalesce(sum(a.qty), 0)::int FROM po_allocations a JOIN po_lines l ON l.id = a.po_line_id
        JOIN supplier_pos p ON p.id = l.po_id WHERE a.order_item_id = i.id AND p.status = 'draft') AS on_draft,
      (SELECT coalesce(sum(a.qty), 0)::int FROM po_allocations a JOIN po_lines l ON l.id = a.po_line_id
        JOIN supplier_pos p ON p.id = l.po_id WHERE a.order_item_id = i.id AND p.status = 'ordered') AS ordered,
      -- Shipments are per supplier-order line, which several orders share: this line's part is at most its own units.
      (SELECT coalesce(sum(least(a.qty, (SELECT coalesce(sum(si.qty), 0) FROM shipment_items si WHERE si.po_line_id = a.po_line_id))), 0)::int
        FROM po_allocations a JOIN po_lines l ON l.id = a.po_line_id JOIN supplier_pos p ON p.id = l.po_id
        WHERE a.order_item_id = i.id AND p.status = 'ordered') AS shipped,
      (SELECT coalesce(sum(sa.qty), 0)::int FROM stock_allocations sa WHERE sa.order_item_id = i.id) AS received,
      (SELECT coalesce(sum(di.qty), 0)::int FROM delivery_items di JOIN stock_allocations sa ON sa.id = di.allocation_id
        JOIN deliveries d ON d.id = di.delivery_id WHERE sa.order_item_id = i.id AND d.status = 'prepared') AS prepared,
      (SELECT coalesce(sum(di.qty), 0)::int FROM delivery_items di JOIN stock_allocations sa ON sa.id = di.allocation_id
        JOIN deliveries d ON d.id = di.delivery_id WHERE sa.order_item_id = i.id AND d.status = 'delivered') AS delivered
    FROM team_order_items i WHERE i.order_id = ${orderId}
    ORDER BY i.supplier_name, i.title
  `);
  return rows.map((r) => ({
    itemId: r.item_id,
    label: r.label,
    onDraft: r.on_draft,
    ordered: r.ordered,
    shipped: r.shipped,
    received: r.received,
    prepared: r.prepared,
    delivered: r.delivered,
  }));
}

/** What points at an order from outside it: supplier-order lines (any status) and delivery-note units. */
export async function getOrderLinks(reader: Reader, orderId: string) {
  const {
    rows: [row],
  } = await reader.execute<{ on_supplier_orders: number; on_delivery_notes: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM po_allocations a JOIN team_order_items i ON i.id = a.order_item_id WHERE i.order_id = ${orderId}) AS on_supplier_orders,
      (SELECT coalesce(sum(di.qty), 0)::int FROM delivery_items di JOIN stock_allocations sa ON sa.id = di.allocation_id
        JOIN team_order_items i ON i.id = sa.order_item_id WHERE i.order_id = ${orderId}) AS on_delivery_notes
  `);
  return { onSupplierOrders: row?.on_supplier_orders ?? 0, onDeliveryNotes: row?.on_delivery_notes ?? 0 };
}

export type HistoryRow = { id: number; at: Date; actor: string | null; text: string };

/**
 * The order card's history: every audit row about the order itself, its quote versions and
 * the delivery notes that carry its units, newest first, in Hebrew.
 */
export async function getOrderHistory(orderId: string): Promise<HistoryRow[]> {
  const related = await db.execute<{ entity: string; id: string }>(sql`
    SELECT 'quote' AS entity, q.id::text AS id FROM quotes q WHERE q.order_id = ${orderId}
    UNION
    SELECT DISTINCT 'delivery', di.delivery_id::text FROM delivery_items di JOIN stock_allocations sa ON sa.id = di.allocation_id
      JOIN team_order_items i ON i.id = sa.order_item_id WHERE i.order_id = ${orderId}
    UNION
    -- A cancelled delivery note no longer reaches the order through its units: its cancel row names the orders.
    SELECT 'delivery', a.entity_id FROM audit_log a
      WHERE a.entity = 'delivery' AND a.action = 'cancel' AND (a.before -> 'orderIds') ? ${orderId}
  `);
  const quoteIds = related.rows.filter((r) => r.entity === "quote").map((r) => r.id);
  const deliveryIds = related.rows.filter((r) => r.entity === "delivery").map((r) => r.id);
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      entity: auditLog.entity,
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      actorName: profiles.fullName,
      actorEmail: profiles.email,
    })
    .from(auditLog)
    .leftJoin(profiles, eq(profiles.id, auditLog.actorId))
    .where(
      or(
        and(eq(auditLog.entity, "team_order"), eq(auditLog.entityId, orderId)),
        quoteIds.length ? and(eq(auditLog.entity, "quote"), inArray(auditLog.entityId, quoteIds)) : undefined,
        deliveryIds.length ? and(eq(auditLog.entity, "delivery"), inArray(auditLog.entityId, deliveryIds)) : undefined,
      ),
    )
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(200);

  return rows.flatMap((r) => {
    const text = describeHistory(r);
    return text ? [{ id: r.id, at: r.at, actor: r.actorName || r.actorEmail || null, text }] : [];
  });
}

/** What cancelling would do, for the warnings on the cancel form. */
export async function previewCancel(orderId: string) {
  return cancelPlan(await getCancelLines(db, orderId));
}

/** Teams an order can move to (not rejected ones), for the move form. */
export async function listTeamsForMove() {
  const rows = await db.select().from(teams).orderBy(teams.program, teams.number);
  return rows.filter((t) => t.status !== "rejected").map((t) => ({ id: t.id, label: teamDisplay(t) }));
}

export type SurplusRow = { label: string; poId: string; poNumber: number; qty: number };

/**
 * A cancelled order's surplus stock: units still on supplier orders marked ordered, which no
 * team will get (what was already delivered to the team isn't surplus).
 */
export async function getSurplus(orderId: string): Promise<SurplusRow[]> {
  const { rows } = await db.execute<{ label: string; po_id: string; po_number: number; qty: number }>(sql`
    SELECT coalesce(i.supplier_sku, i.title) AS label, p.id AS po_id, p.number AS po_number,
      (a.qty - coalesce((SELECT sum(di.qty) FROM delivery_items di JOIN stock_allocations sa ON sa.id = di.allocation_id
        JOIN receipt_lines rl ON rl.id = sa.receipt_line_id WHERE sa.order_item_id = i.id AND rl.po_line_id = l.id), 0))::int AS qty
    FROM po_allocations a
    JOIN po_lines l ON l.id = a.po_line_id
    JOIN supplier_pos p ON p.id = l.po_id AND p.status = 'ordered'
    JOIN team_order_items i ON i.id = a.order_item_id
    WHERE i.order_id = ${orderId}
    ORDER BY p.number, label
  `);
  return rows.filter((r) => r.qty > 0).map((r) => ({ label: r.label, poId: r.po_id, poNumber: r.po_number, qty: r.qty }));
}
