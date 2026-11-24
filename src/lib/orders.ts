import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Viewer } from "@/lib/auth";
import { orderStatus, type OrderStatusKey, type StepDates } from "@/domain/order-status";
import type { OrderStatus } from "@/domain/orders";
import { getOrderDeliveries } from "@/lib/logistics";
import { getOrderLines } from "@/lib/order-status";
import type { CartSheetLine } from "@/components/cart-store";
import { isOrderable } from "@/domain/cart";
import { partDiscount, priceIls, type PriceContext } from "@/domain/pricing";
import { productHref } from "@/lib/catalog-links";
import { undoOpen } from "@/domain/quote-view";

const { cartItems, products, quoteLines, quotes, suppliers, teamOrderItems, teamOrders, teams, variants } = schema;

/** The team's cart with what the catalog knows about each part. `variantIds` limits it to those lines. */
export async function getCart(teamId: string, variantIds?: string[]) {
  return db
    .select({
      variantId: cartItems.variantId,
      qty: cartItems.qty,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
      supplierSku: variants.supplierSku,
      options: variants.options,
      priceUsd: variants.priceUsd,
      supplierPriceUsd: variants.supplierPriceUsd,
      discount: variants.discount,
      markup: variants.markup,
      fixedIls: variants.fixedIls,
      available: variants.available,
      shipsLater: variants.shipsLater,
      shipsLaterEta: variants.shipsLaterEta,
      checkedAt: variants.checkedAt,
      variantMissing: variants.missingSince,
      title: products.title,
      handle: products.handle,
      image: sql<string | null>`${products.images}[1]`,
      productUrl: products.url,
      productStatus: products.status,
      productMissing: products.missingSince,
    })
    .from(cartItems)
    .innerJoin(variants, eq(variants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(variantIds ? and(eq(cartItems.teamId, teamId), inArray(cartItems.variantId, variantIds)) : eq(cartItems.teamId, teamId))
    .orderBy(asc(suppliers.name), asc(products.title));
}

export type CartLine = Awaited<ReturnType<typeof getCart>>[number];

/** A cart line as the cart sheet shows it (CartSheetLine in src/components/cart-store.ts). */
export const toSheetLine =
  (ctx: PriceContext) =>
  (l: CartLine): CartSheetLine => {
    const unitPriceIls = priceIls(l.priceUsd, ctx, l.markup, l.fixedIls);
    return {
    variantId: l.variantId,
    title: l.title,
    options: l.options.map((o) => o.value).join(" / "),
    sku: l.supplierSku,
    image: l.image,
    href: productHref(l.supplierCode, l.handle),
    supplierName: l.supplierName,
    supplierCode: l.supplierCode,
    qty: l.qty,
    unitPriceIls,
    discount: partDiscount(l, ctx, unitPriceIls),
    orderable: isOrderable({ variantMissing: l.variantMissing, productMissing: l.productMissing, productStatus: l.productStatus, priceUsd: l.priceUsd }),
    available: l.available,
    shipsLater: l.shipsLater,
    shipsLaterEta: l.shipsLaterEta,
    checkedAt: l.checkedAt.toISOString(),
    };
  };

export async function cartCount(teamId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`coalesce(sum(${cartItems.qty}), 0)::int` })
    .from(cartItems)
    .where(eq(cartItems.teamId, teamId));
  return count;
}

/** Orders with their current totals, newest first. Pass a team to limit it to that team, and `limit` to take only the newest. */
export async function listOrders(teamId?: string, limit?: number) {
  const latestQuote = db
    .selectDistinctOn([quotes.orderId], {
      orderId: quotes.orderId,
      id: quotes.id,
      shippingIls: quotes.shippingIls,
    })
    .from(quotes)
    .orderBy(quotes.orderId, desc(quotes.version))
    .as("latest_quote");

  const query = db
    .select({
      id: teamOrders.id,
      number: teamOrders.number,
      status: teamOrders.status,
      submittedAt: teamOrders.submittedAt,
      deliveryMethod: teamOrders.deliveryMethod,
      teamName: teams.name,
      teamProgram: teams.program,
      teamNumber: teams.number,
      teamStatus: teams.status,
      lineCount: sql<number>`(SELECT count(*)::int FROM ${teamOrderItems} WHERE ${teamOrderItems.orderId} = ${teamOrders.id})`,
      requestTotal: sql<number>`(SELECT coalesce(sum(${teamOrderItems.qty} * ${teamOrderItems.unitPriceIls}), 0)::int FROM ${teamOrderItems} WHERE ${teamOrderItems.orderId} = ${teamOrders.id})`,
      quoteTotal: sql<number | null>`(SELECT sum(${quoteLines.qty} * ${quoteLines.unitPriceIls})::int + ${latestQuote.shippingIls} FROM ${quoteLines} WHERE ${quoteLines.quoteId} = ${latestQuote.id})`,
    })
    .from(teamOrders)
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .leftJoin(latestQuote, eq(latestQuote.orderId, teamOrders.id))
    .where(teamId ? eq(teamOrders.teamId, teamId) : undefined)
    .orderBy(desc(teamOrders.number))
    .$dynamic();

  return limit ? query.limit(limit) : query;
}

/** The team's newest order with its totals, for the home page's "Order again" (one row, not the list). */
export async function latestOrder(teamId: string) {
  const [last] = await listOrders(teamId, 1);
  return last ?? null;
}

/**
 * One order with everything needed to show it, or null when it doesn't exist or
 * the viewer isn't allowed to see it. Both look the same, so a team can't probe
 * for other teams' orders (AT-02).
 */
export async function getOrderForViewer(orderId: string, viewer: Viewer) {
  if (!z.uuid().safeParse(orderId).success) return null;

  const [row] = await db
    .select({ order: teamOrders, team: teams })
    .from(teamOrders)
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .where(eq(teamOrders.id, orderId));
  if (!row) return null;

  const membership = viewer.teams.find((t) => t.id === row.order.teamId);
  if (!viewer.isAdmin && !membership) return null;
  return { ...(await loadOrder(row)), membership: membership ?? null };
}

/**
 * Everything the order and quote pages show, with no permission check: callers check
 * first (getOrderForViewer, or a verified approve link on /q/<token>).
 */
export async function loadOrderById(orderId: string) {
  const [row] = await db
    .select({ order: teamOrders, team: teams })
    .from(teamOrders)
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .where(eq(teamOrders.id, orderId));
  return row ? loadOrder(row) : null;
}

async function loadOrder(row: { order: typeof teamOrders.$inferSelect; team: typeof teams.$inferSelect }) {
  const orderId = row.order.id;
  // All at once: none needs another's answer (quote lines are found through their quote's order).
  const [items, quoteRows, lines, progress, deliveries] = await Promise.all([
    db.select().from(teamOrderItems).where(eq(teamOrderItems.orderId, orderId)).orderBy(asc(teamOrderItems.supplierName), asc(teamOrderItems.title)),
    db.select().from(quotes).where(eq(quotes.orderId, orderId)).orderBy(desc(quotes.version)),
    db
      .select({ line: quoteLines })
      .from(quoteLines)
      .innerJoin(quotes, eq(quotes.id, quoteLines.quoteId))
      .where(eq(quotes.orderId, orderId))
      .then((rows) => rows.map((r) => r.line)),
    getOrderLines([orderId]),
    getOrderDeliveries(orderId),
  ]);

  return {
    ...row,
    items,
    progress: new Map(progress.map((p) => [p.orderItemId, p])),
    deliveries,
    quotes: quoteRows.map((quote) => ({ ...quote, lines: lines.filter((l) => l.quoteId === quote.id) })),
  };
}

/** Orders waiting for the Israeli supplier to check and quote. */
export async function countOrdersAwaitingReview() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamOrders)
    .where(and(eq(teamOrders.status, "submitted")));
  return count;
}

export type CheckoutDefaults = {
  deliveryMethod: "pickup" | "ship";
  address: string;
  contactName: string;
  contactPhone: string;
};

/** What the cart sheet sends with unless changed: the team's last order, else the team's details. */
export async function getCheckoutDefaults(teamId: string): Promise<CheckoutDefaults> {
  const [last] = await db
    .select({ deliveryMethod: teamOrders.deliveryMethod, address: teamOrders.address, contactName: teamOrders.contactName, contactPhone: teamOrders.contactPhone })
    .from(teamOrders)
    .where(eq(teamOrders.teamId, teamId))
    .orderBy(desc(teamOrders.submittedAt))
    .limit(1);
  if (last) return { deliveryMethod: last.deliveryMethod, address: last.address ?? "", contactName: last.contactName, contactPhone: last.contactPhone };
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  return {
    deliveryMethod: team?.address ? "ship" : "pickup",
    address: team?.address ?? "",
    contactName: team?.contactName ?? "",
    contactPhone: team?.contactPhone ?? "",
  };
}

/** Each order's status (src/domain/order-status.ts), from its stored status and its lines' purchasing records. */
export async function getOrderStages(orders: { id: string; status: OrderStatus }[]): Promise<Map<string, OrderStatusKey>> {
  if (orders.length === 0) return new Map();
  const progress = await getOrderLines(orders.map((o) => o.id));
  return new Map(orders.map((o) => [o.id, orderStatus(o.status, progress.filter((p) => p.orderId === o.id)).status]));
}

/**
 * When the order first reached each step (S8 dated timeline): the request, the latest quote,
 * the approval, then the first supplier order, shipment, receipt and delivery note, and the
 * last delivery. Nothing extra is stored.
 */
export async function getStepDates(orderId: string, submittedAt: Date): Promise<StepDates> {
  const {
    rows: [row],
  } = await db.execute<Record<"quote_sent" | "approved" | "ordered" | "shipped" | "received" | "prepared" | "delivered", string | null>>(sql`
    WITH items AS (SELECT id FROM team_order_items WHERE order_id = ${orderId}),
    lines AS (SELECT DISTINCT a.po_line_id FROM po_allocations a WHERE a.order_item_id IN (SELECT id FROM items))
    SELECT
      (SELECT max(sent_at) FROM quotes WHERE order_id = ${orderId}) AS quote_sent,
      (SELECT max(qa.at) FROM quote_approvals qa JOIN quotes q ON q.id = qa.quote_id WHERE q.order_id = ${orderId} AND q.status = 'approved') AS approved,
      (SELECT min(p.ordered_at) FROM po_lines l JOIN supplier_pos p ON p.id = l.po_id WHERE l.id IN (SELECT po_line_id FROM lines) AND p.status = 'ordered') AS ordered,
      (SELECT min(s.created_at) FROM shipment_items si JOIN shipments s ON s.id = si.shipment_id WHERE si.po_line_id IN (SELECT po_line_id FROM lines)) AS shipped,
      (SELECT min(r.received_at) FROM stock_allocations sa JOIN receipt_lines rl ON rl.id = sa.receipt_line_id
        JOIN receipts r ON r.id = rl.receipt_id WHERE sa.order_item_id IN (SELECT id FROM items)) AS received,
      (SELECT min(d.created_at) FROM delivery_items di JOIN deliveries d ON d.id = di.delivery_id
        JOIN stock_allocations sa ON sa.id = di.allocation_id WHERE sa.order_item_id IN (SELECT id FROM items)) AS prepared,
      (SELECT max(d.delivered_at) FROM delivery_items di JOIN deliveries d ON d.id = di.delivery_id
        JOIN stock_allocations sa ON sa.id = di.allocation_id WHERE sa.order_item_id IN (SELECT id FROM items)) AS delivered
  `);
  const at = (v: string | null | undefined) => (v ? new Date(v) : undefined);
  return {
    awaiting_quote: submittedAt,
    quote_sent: at(row?.quote_sent),
    to_order: at(row?.approved),
    ordered: at(row?.ordered),
    to_warehouse: at(row?.shipped),
    at_warehouse: at(row?.received),
    to_team: at(row?.prepared),
    delivered: at(row?.delivered),
  };
}

/** The team's latest "request a change" on this quote version (S8), if any. */
export async function getChangeRequest(quoteId: string | undefined): Promise<{ at: Date; reason: string } | null> {
  if (!quoteId) return null;
  const [row] = await db
    .select({ at: schema.auditLog.at, after: schema.auditLog.after })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.entity, "quote"), eq(schema.auditLog.entityId, quoteId), eq(schema.auditLog.action, "change_request")))
    .orderBy(desc(schema.auditLog.at))
    .limit(1);
  if (!row) return null;
  return { at: row.at, reason: String((row.after as { reason?: string } | null)?.reason ?? "") };
}

/**
 * The last approve, reject or cancel still inside its undo window (S8), so a page that
 * re-renders after the decision keeps offering "ביטול" until the window closes.
 */
export async function recentDecision(entity: "quote" | "team_order", entityId: string | undefined): Promise<{ action: string; at: Date } | null> {
  if (!entityId) return null;
  const actions = entity === "quote" ? ["approve", "reject", "undo"] : ["cancel", "undo_cancel"];
  const [row] = await db
    .select({ action: schema.auditLog.action, at: schema.auditLog.at })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.entity, entity), eq(schema.auditLog.entityId, entityId), inArray(schema.auditLog.action, actions)))
    .orderBy(desc(schema.auditLog.at))
    .limit(1);
  if (!row || row.action.startsWith("undo") || !undoOpen(row.at)) return null;
  return row;
}
