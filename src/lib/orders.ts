import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Viewer } from "@/lib/auth";
import { orderStatus, type OrderStatusKey } from "@/domain/order-status";
import type { OrderStatus } from "@/domain/orders";
import { getOrderDeliveries } from "@/lib/logistics";
import { getOrderLines } from "@/lib/order-status";
import type { CartSheetLine } from "@/components/cart-store";
import { isOrderable } from "@/domain/cart";
import { priceIls } from "@/domain/pricing";
import { productHref } from "@/lib/catalog-links";

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
      available: variants.available,
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
  (usdIlsRate: number) =>
  (l: CartLine): CartSheetLine => ({
    variantId: l.variantId,
    title: l.title,
    options: l.options.map((o) => o.value).join(" / "),
    sku: l.supplierSku,
    image: l.image,
    href: productHref(l.supplierCode, l.handle),
    supplierName: l.supplierName,
    qty: l.qty,
    unitPriceIls: priceIls(l.priceUsd, usdIlsRate),
    orderable: isOrderable({ variantMissing: l.variantMissing, productMissing: l.productMissing, productStatus: l.productStatus, priceUsd: l.priceUsd }),
    available: l.available,
    checkedAt: l.checkedAt.toISOString(),
  });

export async function cartCount(teamId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`coalesce(sum(${cartItems.qty}), 0)::int` })
    .from(cartItems)
    .where(eq(cartItems.teamId, teamId));
  return count;
}

/** Orders with their current totals, newest first. Pass a team to limit it to that team. */
export async function listOrders(teamId?: string) {
  const latestQuote = db
    .selectDistinctOn([quotes.orderId], {
      orderId: quotes.orderId,
      id: quotes.id,
      shippingIls: quotes.shippingIls,
    })
    .from(quotes)
    .orderBy(quotes.orderId, desc(quotes.version))
    .as("latest_quote");

  const rows = await db
    .select({
      id: teamOrders.id,
      number: teamOrders.number,
      status: teamOrders.status,
      submittedAt: teamOrders.submittedAt,
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
    .orderBy(desc(teamOrders.number));

  return rows;
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

  const items = await db
    .select()
    .from(teamOrderItems)
    .where(eq(teamOrderItems.orderId, orderId))
    .orderBy(asc(teamOrderItems.supplierName), asc(teamOrderItems.title));

  const quoteRows = await db.select().from(quotes).where(eq(quotes.orderId, orderId)).orderBy(desc(quotes.version));
  const lines = quoteRows.length
    ? await db
        .select()
        .from(quoteLines)
        .where(
          inArray(
            quoteLines.quoteId,
            quoteRows.map((q) => q.id),
          ),
        )
    : [];

  const progress = await getOrderLines([orderId]);

  return {
    ...row,
    membership: membership ?? null,
    items,
    progress: new Map(progress.map((p) => [p.orderItemId, p])),
    deliveries: await getOrderDeliveries(orderId),
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
