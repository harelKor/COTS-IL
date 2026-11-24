import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OrderStatus } from "@/domain/orders";
import { getSettings } from "./settings";

const { auditLog, quoteLines, quotes, teamOrders } = schema;

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type VersionLine = { itemId: string; qty: number; unitPriceIls: number; changeReason: string };

/** The newest quote version that still counts (not superseded), with its lines, or null. */
export async function currentQuote(tx: Pick<typeof db, "select">, orderId: string) {
  const [quote] = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.orderId, orderId), ne(quotes.status, "superseded")))
    .orderBy(desc(quotes.version))
    .limit(1);
  if (!quote) return null;
  const lines = await tx.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id));
  return { ...quote, lines };
}

/**
 * Sends a new quote version: earlier versions stay on record as superseded, the order waits
 * for the team again, and the send goes to the audit log. Call inside a transaction that
 * holds the order's row lock.
 */
export async function insertQuoteVersion(
  tx: Tx,
  v: {
    orderId: string;
    adminId: string;
    orderStatus: OrderStatus;
    shippingIls: number;
    notes: string | null;
    lines: VersionLine[];
    /** Set when lines were already on supplier orders (M2), for the history. */
    revision?: boolean;
    /** Why this version went out, when it wasn't the editor (e.g. a replaced part). */
    cause?: string;
  },
) {
  const [previous] = await tx
    .select({ version: quotes.version })
    .from(quotes)
    .where(eq(quotes.orderId, v.orderId))
    .orderBy(desc(quotes.version))
    .limit(1);

  await tx
    .update(quotes)
    .set({ status: "superseded" })
    .where(and(eq(quotes.orderId, v.orderId), inArray(quotes.status, ["sent", "approved"])));

  const version = (previous?.version ?? 0) + 1;
  // The VAT its prices include, as of today (D1): the quote keeps it even if the rate changes later.
  const vatRate = String((await getSettings()).pricing.vatRate);
  const [quote] = await tx
    .insert(quotes)
    .values({ orderId: v.orderId, version, shippingIls: v.shippingIls, vatRate, notes: v.notes, sentBy: v.adminId })
    .returning();
  await tx.insert(quoteLines).values(
    v.lines.map((l) => ({ quoteId: quote.id, itemId: l.itemId, qty: l.qty, unitPriceIls: l.unitPriceIls, changeReason: l.changeReason || null })),
  );

  await tx.update(teamOrders).set({ status: "quote_sent", rejectionReason: null }).where(eq(teamOrders.id, v.orderId));
  await tx.insert(auditLog).values({
    actorId: v.adminId,
    entity: "quote",
    entityId: quote.id,
    action: "send",
    before: { orderStatus: v.orderStatus },
    after: { version, shippingIls: v.shippingIls, vatRate: Number(vatRate), lines: v.lines, revision: v.revision || undefined, cause: v.cause },
  });
  return { quoteId: quote.id, version };
}
