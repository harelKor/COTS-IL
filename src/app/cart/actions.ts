"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { MAX_SHARED_LINES, type SharedLine } from "@/domain/cart-share";
import { cartChanges, cartFingerprint, isOrderable, maxMerge, type CartChange } from "@/domain/cart";
import { MARKUP, priceIls } from "@/domain/pricing";
import { getViewer, orderingTeam, orderingTeams, TEAM_COOKIE, type Viewer } from "@/lib/auth";
import { cookies } from "next/headers";
import { usdIlsRate } from "@/lib/fx";
import { getCart, getCheckoutDefaults, toSheetLine } from "@/lib/orders";
import type { CartSheetLine } from "@/components/cart-store";

const { cartItems, products, suppliers, teamOrderItems, teamOrders, variants } = schema;

const MAX_QTY = 9999;
const qty = z.coerce.number().int().min(1).max(MAX_QTY);

/**
 * Every cart action runs through this, so a team that was rejected or suspended
 * can't order (AT-01). Anyone signed in to the team can (D11). A new team still
 * pending approval can too: its first request is reviewed together with the team.
 */
async function requireOrderingTeam() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/cart");
  const team = orderingTeam(viewer);
  if (!team) redirect("/pending");
  return { viewer, team };
}

type Team = NonNullable<ReturnType<typeof orderingTeam>>;



/** Adds to the team's cart, or raises the quantity of a line that's already there. Returns an error message, or null. */
async function addLine(teamId: string, userId: string, variantId: string, count: number): Promise<string | null> {
  const [variant] = await db
    .select({ priceUsd: variants.priceUsd, variantMissing: variants.missingSince, status: products.status, productMissing: products.missingSince })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(variants.id, variantId));
  if (!variant || !isOrderable({ ...variant, productStatus: variant.status })) {
    return "לא ניתן להזמין את הפריט הזה";
  }

  await db
    .insert(cartItems)
    .values({ teamId, variantId, qty: count, addedBy: userId })
    .onConflictDoUpdate({
      target: [cartItems.teamId, cartItems.variantId],
      set: { qty: sql`LEAST(${cartItems.qty} + excluded.qty, ${MAX_QTY})` },
    });
  return null;
}

/** The cart line as it now is in the database, for the client store to put in place. Null when it's gone. */
async function lineNow(teamId: string, variantId: string): Promise<CartSheetLine | null> {
  const [line] = await getCart(teamId, [variantId]);
  return line ? toSheetLine(await usdIlsRate())(line) : null;
}

export type LineResult = { error?: string; line?: CartSheetLine | null };

/**
 * For the catalog, the search panel and Undo, which add without a form and stay
 * on the page. Answers with the changed line instead of re-rendering the page,
 * so taps in flight don't jump back.
 */
export async function quickAdd(variantId: string, count: number): Promise<LineResult> {
  const { viewer, team } = await requireOrderingTeam();
  const parsed = z.object({ variantId: z.uuid(), qty }).safeParse({ variantId, qty: count });
  if (!parsed.success) return { error: "כמות לא תקינה" };

  const error = await addLine(team.id, viewer.id, parsed.data.variantId, parsed.data.qty);
  if (error) return { error };
  return { line: await lineNow(team.id, parsed.data.variantId) };
}

/** Sets a cart line's quantity from a stepper (debounced on the client). */
export async function setCartQty(variantId: string, count: number): Promise<LineResult> {
  const { team } = await requireOrderingTeam();
  const parsed = z.object({ variantId: z.uuid(), qty }).safeParse({ variantId, qty: count });
  if (!parsed.success) return { error: "כמות לא תקינה" };
  const updated = await db
    .update(cartItems)
    .set({ qty: parsed.data.qty })
    .where(and(eq(cartItems.teamId, team.id), eq(cartItems.variantId, parsed.data.variantId)))
    .returning({ variantId: cartItems.variantId });
  if (updated.length === 0) return { error: "הפריט כבר לא בסל", line: null };
  return { line: await lineNow(team.id, parsed.data.variantId) };
}

/** Takes a line out of the cart. Undo adds it back with quickAdd. */
export async function removeFromCart(variantId: string): Promise<{ error?: string }> {
  const { team } = await requireOrderingTeam();
  const id = z.uuid().safeParse(variantId);
  if (!id.success) return { error: "הפריט לא נמצא" };
  await db.delete(cartItems).where(and(eq(cartItems.teamId, team.id), eq(cartItems.variantId, id.data)));
  return {};
}

const deliveryFields = {
  deliveryMethod: z.enum(["pickup", "ship"], { error: "בחרו איסוף או משלוח" }),
  address: z.string().trim().max(500).default(""),
  contactName: z.string().trim().min(2, "נא למלא איש קשר").max(100),
  contactPhone: z.string().trim().regex(/^[0-9+\-() ]{7,20}$/, "מספר טלפון לא תקין"),
  notes: z.string().trim().max(2000).default(""),
};
const needsAddress = (v: { deliveryMethod: string; address: string }) => v.deliveryMethod === "pickup" || v.address.length >= 5;
const addressError = { path: ["address"], message: "למשלוח צריך כתובת" };

const deliverySchema = z.object(deliveryFields).refine(needsAddress, addressError);
type Delivery = z.infer<typeof deliverySchema>;

export type SendState = {
  orderId?: string;
  number?: number;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Lines that can't be ordered any more, so the sheet can name them. */
  blocked?: string[];
  /** The cart changed since the sender saw it: what changed, and the cart as it is now. */
  changed?: CartChange[];
  lines?: CartSheetLine[];
};

/**
 * The cart sheet's "Send quote request": one tap for anyone on the team. Delivery and
 * contact come from the team's last order (or its details) unless changed.
 */
export async function sendQuoteRequest(changes: Partial<Delivery> = {}, seen?: SharedLine[]): Promise<SendState> {
  const { viewer, team } = await requireOrderingTeam();
  const parsed = deliverySchema.safeParse({ ...(await getCheckoutDefaults(team.id)), ...changes });
  if (!parsed.success) return { error: "צריך להשלים פרטי מסירה", fieldErrors: parsed.error.flatten().fieldErrors };
  const seenLines = z.array(z.object({ variantId: z.uuid(), qty: z.number().int() })).max(500).safeParse(seen ?? null);
  const result = await createOrder(viewer, team, parsed.data, seenLines.success ? seenLines.data : null);
  if ("changed" in result && result.changed) return { ...result, lines: (await getCart(team.id)).map(toSheetLine(await usdIlsRate())) };
  if ("error" in result) return result;
  revalidatePath("/cart");
  revalidatePath("/orders");
  refresh();
  return result;
}

/** Turns the cart into an order, copying prices and SKUs as they are right now (spec §8). */
async function createOrder(
  viewer: Viewer,
  team: Team,
  input: Delivery,
  seen: SharedLine[] | null,
): Promise<{ orderId: string; number: number } | { error: string; blocked?: string[]; changed?: CartChange[] }> {
  // The order keeps the rate it was priced at, so later rates never change it.
  const rate = await usdIlsRate();
  return db.transaction(async (tx) => {
    // Locks the cart, so a double click or two team members can't submit the same lines twice.
    const lines = await tx
      .select({
        variantId: cartItems.variantId,
        qty: cartItems.qty,
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
        supplierSku: variants.supplierSku,
        options: variants.options,
        priceUsd: variants.priceUsd,
        variantMissing: variants.missingSince,
        title: products.title,
        productUrl: products.url,
        status: products.status,
        productMissing: products.missingSince,
      })
      .from(cartItems)
      .innerJoin(variants, eq(variants.id, cartItems.variantId))
      .innerJoin(products, eq(products.id, variants.productId))
      .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
      .where(eq(cartItems.teamId, team.id))
      .for("update", { of: cartItems });

    // Someone else on the team account may have changed the cart since this sender looked at it.
    if (seen && cartFingerprint(seen) !== cartFingerprint(lines)) {
      return { error: "הסל השתנה בינתיים. בדקו את השינויים ושלחו שוב.", changed: cartChanges(seen, lines) };
    }
    if (lines.length === 0) return { error: "הסל ריק" };

    const blocked = lines.filter((l) => !isOrderable({ ...l, productStatus: l.status }));
    if (blocked.length > 0) {
      const names = blocked.map((l) => l.title).join(", ");
      return { error: `לא ניתן להזמין עוד: ${names}. הסירו ונסו שוב.`, blocked: blocked.map((l) => l.variantId) };
    }

    const now = new Date();
    const [order] = await tx
      .insert(teamOrders)
      .values({
        teamId: team.id,
        deliveryMethod: input.deliveryMethod,
        address: input.deliveryMethod === "ship" ? input.address : null,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        notes: input.notes || null,
        submittedBy: viewer.id,
        submittedAt: now,
      })
      .returning();

    await tx.insert(teamOrderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        variantId: l.variantId,
        qty: l.qty,
        supplierCode: l.supplierCode,
        supplierName: l.supplierName,
        supplierSku: l.supplierSku,
        title: l.title,
        options: l.options,
        productUrl: l.productUrl,
        priceUsd: l.priceUsd!,
        multiplier: String(MARKUP),
        usdIlsRate: String(rate),
        unitPriceIls: priceIls(l.priceUsd, rate)!,
        pricedAt: now,
      })),
    );

    await tx.delete(cartItems).where(eq(cartItems.teamId, team.id));

    await tx.insert(schema.auditLog).values({
      actorId: viewer.id,
      entity: "team_order",
      entityId: order.id,
      action: "submit",
      after: { number: order.number, lines: lines.length },
    });

    return { orderId: order.id, number: order.number };
  });
}

export type MergeResult = { added: number; skipped: string[]; lines?: CartSheetLine[]; error?: string };

/**
 * Lines from elsewhere (a guest's cart at sign-in, a shared-cart link) join the
 * team's cart. Each part ends at the larger of the two quantities, never the
 * sum, so a link opened twice or a merge retried doesn't double anything. One
 * upsert in one transaction. Answers with the whole cart and the titles of
 * parts that can't be ordered any more.
 */
export async function mergeCart(lines: SharedLine[]): Promise<MergeResult> {
  const { viewer, team } = await requireOrderingTeam();
  const parsed = z.array(z.object({ variantId: z.uuid(), qty })).max(MAX_SHARED_LINES).safeParse(lines);
  if (!parsed.success) return { added: 0, skipped: [], error: "הסל לא תקין" };
  const wanted = maxMerge([], parsed.data);
  if (wanted.length === 0) return { added: 0, skipped: [], lines: (await getCart(team.id)).map(toSheetLine(await usdIlsRate())) };
  const ids = wanted.map((l) => l.variantId);

  const { added, skipped } = await db.transaction(async (tx) => {
    const parts = await tx
      .select({ id: variants.id, title: products.title, priceUsd: variants.priceUsd, variantMissing: variants.missingSince, status: products.status, productMissing: products.missingSince })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(inArray(variants.id, ids));
    const orderable = new Set(parts.filter((p) => isOrderable({ ...p, productStatus: p.status })).map((p) => p.id));
    const skipped = ids.filter((id) => !orderable.has(id)).map((id) => parts.find((p) => p.id === id)?.title ?? "פריט שכבר לא בקטלוג");

    const own = await tx
      .select({ variantId: cartItems.variantId, qty: cartItems.qty })
      .from(cartItems)
      .where(and(eq(cartItems.teamId, team.id), inArray(cartItems.variantId, ids)))
      .for("update");
    const changes = maxMerge(own, wanted.filter((l) => orderable.has(l.variantId)));
    if (changes.length > 0) {
      await tx
        .insert(cartItems)
        .values(changes.map((l) => ({ teamId: team.id, variantId: l.variantId, qty: l.qty, addedBy: viewer.id })))
        .onConflictDoUpdate({ target: [cartItems.teamId, cartItems.variantId], set: { qty: sql`GREATEST(${cartItems.qty}, excluded.qty)` } });
    }
    return { added: changes.length, skipped };
  });
  return { added, skipped, lines: (await getCart(team.id)).map(toSheetLine(await usdIlsRate())) };
}

/** Adds an earlier order's parts to the cart again, skipping any that can't be ordered now. */
export async function reorder(orderId: string): Promise<{ added: number; skipped: number; error?: string; lines?: CartSheetLine[] }> {
  const { viewer, team } = await requireOrderingTeam();
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { added: 0, skipped: 0, error: "ההזמנה לא נמצאה" };
  const [order] = await db.select().from(teamOrders).where(and(eq(teamOrders.id, id.data), eq(teamOrders.teamId, team.id)));
  if (!order) return { added: 0, skipped: 0, error: "ההזמנה לא נמצאה" };
  const items = await db.select({ variantId: teamOrderItems.variantId, qty: teamOrderItems.qty }).from(teamOrderItems).where(eq(teamOrderItems.orderId, order.id));
  let added = 0;
  for (const item of items) if (!(await addLine(team.id, viewer.id, item.variantId, item.qty))) added++;
  // The cart as it now is, for the client store: no page re-render.
  const lines = (await getCart(team.id)).map(toSheetLine(await usdIlsRate()));
  return { added, skipped: items.length - added, lines };
}

/** The team switcher, for users in more than one team: which team's cart and orders they act for. */
export async function switchTeam(teamId: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!orderingTeams(viewer).some((t) => t.id === teamId)) return;
  (await cookies()).set(TEAM_COOKIE, teamId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  refresh();
}
