import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Viewer } from "@/lib/auth";

const { cartItems, products, quoteLines, quotes, suppliers, teamOrderItems, teamOrders, teams, variants } = schema;

export async function getCart(teamId: string) {
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
    .where(eq(cartItems.teamId, teamId))
    .orderBy(asc(suppliers.name), asc(products.title));
}

export type CartLine = Awaited<ReturnType<typeof getCart>>[number];

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

  return {
    ...row,
    membership: membership ?? null,
    items,
    quotes: quoteRows.map((quote) => ({ ...quote, lines: lines.filter((l) => l.quoteId === quote.id) })),
  };
}

export async function countOrdersAwaitingMentor() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamOrders)
    .where(and(eq(teamOrders.status, "submitted")));
  return count;
}
