"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { SharedLine } from "@/domain/cart-share";
import { DEFAULT_MULTIPLIER, priceIls } from "@/domain/pricing";
import { getViewer, orderingTeam, type Viewer } from "@/lib/auth";
import { getCheckoutDefaults } from "@/lib/orders";

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
  if (!variant || variant.variantMissing || variant.productMissing || variant.status !== "published" || priceIls(variant.priceUsd) === null) {
    return "לא ניתן להזמין את הפריט הזה";
  }

  await db
    .insert(cartItems)
    .values({ teamId, variantId, qty: count, addedBy: userId })
    .onConflictDoUpdate({
      target: [cartItems.teamId, cartItems.variantId],
      set: { qty: sql`LEAST(${cartItems.qty} + excluded.qty, ${MAX_QTY})` },
    });
  revalidatePath("/cart");
  return null;
}


/** For the search panel and the cart sheet, which add without a form and stay on the page. */
export async function quickAdd(variantId: string, count: number): Promise<{ error?: string }> {
  const { viewer, team } = await requireOrderingTeam();
  const parsed = z.object({ variantId: z.uuid(), qty }).safeParse({ variantId, qty: count });
  if (!parsed.success) return { error: "כמות לא תקינה" };

  const error = await addLine(team.id, viewer.id, parsed.data.variantId, parsed.data.qty);
  refresh();
  return error ? { error } : {};
}

/** Sets a cart line's quantity from the cart sheet's stepper. */
export async function setCartQty(variantId: string, count: number): Promise<void> {
  const { team } = await requireOrderingTeam();
  const parsed = z.object({ variantId: z.uuid(), qty }).safeParse({ variantId, qty: count });
  if (!parsed.success) return;
  await db
    .update(cartItems)
    .set({ qty: parsed.data.qty })
    .where(and(eq(cartItems.teamId, team.id), eq(cartItems.variantId, parsed.data.variantId)));
  revalidatePath("/cart");
  refresh();
}

/** Takes a line out of the cart from a stepper. Undo adds it back with quickAdd. */
export async function removeFromCart(variantId: string): Promise<void> {
  const { team } = await requireOrderingTeam();
  const id = z.uuid().safeParse(variantId);
  if (!id.success) return;
  await db.delete(cartItems).where(and(eq(cartItems.teamId, team.id), eq(cartItems.variantId, id.data)));
  revalidatePath("/cart");
  refresh();
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

export type SendState = { orderId?: string; number?: number; error?: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * The cart sheet's "Send quote request": one tap for anyone on the team. Delivery and
 * contact come from the team's last order (or its details) unless changed.
 */
export async function sendQuoteRequest(changes: Partial<Delivery> = {}): Promise<SendState> {
  const { viewer, team } = await requireOrderingTeam();
  const parsed = deliverySchema.safeParse({ ...(await getCheckoutDefaults(team.id)), ...changes });
  if (!parsed.success) return { error: "צריך להשלים פרטי מסירה", fieldErrors: parsed.error.flatten().fieldErrors };
  const result = await createOrder(viewer, team, parsed.data);
  if ("error" in result) return { error: result.error };
  revalidatePath("/cart");
  revalidatePath("/orders");
  refresh();
  return result;
}

/** Turns the cart into an order, copying prices and SKUs as they are right now (spec §8). */
async function createOrder(viewer: Viewer, team: Team, input: Delivery): Promise<{ orderId: string; number: number } | { error: string }> {
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

    if (lines.length === 0) return { error: "הסל ריק" };

    const blocked = lines.filter(
      (l) => l.variantMissing || l.productMissing || l.status !== "published" || priceIls(l.priceUsd) === null,
    );
    if (blocked.length > 0) return { error: "יש בסל פריטים שכבר לא ניתן להזמין. הסירו אותם ונסו שוב." };

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
        multiplier: String(DEFAULT_MULTIPLIER),
        unitPriceIls: priceIls(l.priceUsd)!,
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

/** A guest's cart, kept in the browser until sign-in, joins the team's cart. */
export async function mergeCart(lines: SharedLine[]): Promise<{ added: number }> {
  const { viewer, team } = await requireOrderingTeam();
  let added = 0;
  for (const line of lines.slice(0, 100)) {
    const parsed = z.object({ variantId: z.uuid(), qty }).safeParse(line);
    if (parsed.success && !(await addLine(team.id, viewer.id, parsed.data.variantId, parsed.data.qty))) added++;
  }
  refresh();
  return { added };
}

/** Adds an earlier order's parts to the cart again, skipping any that can't be ordered now. */
export async function reorder(orderId: string): Promise<{ added: number; skipped: number; error?: string }> {
  const { viewer, team } = await requireOrderingTeam();
  const id = z.uuid().safeParse(orderId);
  if (!id.success) return { added: 0, skipped: 0, error: "ההזמנה לא נמצאה" };
  const [order] = await db.select().from(teamOrders).where(and(eq(teamOrders.id, id.data), eq(teamOrders.teamId, team.id)));
  if (!order) return { added: 0, skipped: 0, error: "ההזמנה לא נמצאה" };
  const items = await db.select({ variantId: teamOrderItems.variantId, qty: teamOrderItems.qty }).from(teamOrderItems).where(eq(teamOrderItems.orderId, order.id));
  let added = 0;
  for (const item of items) if (!(await addLine(team.id, viewer.id, item.variantId, item.qty))) added++;
  refresh();
  return { added, skipped: items.length - added };
}
