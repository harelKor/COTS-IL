"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { canOrder } from "@/domain/orders";
import { DEFAULT_MULTIPLIER, priceIls } from "@/domain/pricing";
import { activeTeam, getViewer } from "@/lib/auth";
import { formValues, type FormState } from "@/lib/validation";

const { cartItems, products, suppliers, teamOrderItems, teamOrders, variants } = schema;

const MAX_QTY = 9999;
const qty = z.coerce.number().int().min(1).max(MAX_QTY);

/** Every cart action runs through this, so an unapproved team or a viewer can't order (AT-01). */
async function requireOrderingTeam() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/cart");
  const team = activeTeam(viewer);
  if (!team) redirect("/pending");
  if (!canOrder(team.role)) throw new Error("This role can't order");
  return { viewer, team };
}

export type AddToCartState = { added?: boolean; error?: string };

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

export async function addToCart(_prev: AddToCartState, formData: FormData): Promise<AddToCartState> {
  const { viewer, team } = await requireOrderingTeam();
  const parsed = z.object({ variantId: z.uuid(), qty }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "כמות לא תקינה" };

  const error = await addLine(team.id, viewer.id, parsed.data.variantId, parsed.data.qty);
  if (error) return { error };
  refresh();
  return { added: true };
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

export async function updateCartItem(formData: FormData) {
  const { team } = await requireOrderingTeam();
  const parsed = z.object({ variantId: z.uuid(), qty }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await db
    .update(cartItems)
    .set({ qty: parsed.data.qty })
    .where(and(eq(cartItems.teamId, team.id), eq(cartItems.variantId, parsed.data.variantId)));
  revalidatePath("/cart");
}

export async function removeCartItem(formData: FormData) {
  const { team } = await requireOrderingTeam();
  const variantId = z.uuid().parse(formData.get("variantId"));
  await db.delete(cartItems).where(and(eq(cartItems.teamId, team.id), eq(cartItems.variantId, variantId)));
  revalidatePath("/cart");
}

const submitSchema = z
  .object({
    deliveryMethod: z.enum(["pickup", "ship"], { error: "בחרו איסוף או משלוח" }),
    address: z.string().trim().max(500).default(""),
    contactName: z.string().trim().min(2, "נא למלא איש קשר").max(100),
    contactPhone: z.string().trim().regex(/^[0-9+\-() ]{7,20}$/, "מספר טלפון לא תקין"),
    notes: z.string().trim().max(2000).default(""),
    confirm: z.literal("on", { error: "צריך לאשר את שליחת הבקשה" }),
  })
  .refine((v) => v.deliveryMethod === "pickup" || v.address.length >= 5, {
    path: ["address"],
    message: "למשלוח צריך כתובת",
  });

/** Turns the cart into an order, copying prices and SKUs as they are right now (spec §8). */
export async function submitOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const { viewer, team } = await requireOrderingTeam();
  const values = formValues(formData);
  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  const input = parsed.data;

  const result = await db.transaction(async (tx) => {
    // Locks the cart, so a double click or two buyers can't submit the same lines twice.
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

    return { orderId: order.id };
  });

  if ("error" in result) return { error: result.error, values };
  revalidatePath("/cart");
  redirect(`/orders/${result.orderId}`);
}
