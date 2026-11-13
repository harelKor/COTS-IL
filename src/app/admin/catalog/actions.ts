"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { isEmptyOverride } from "@/domain/catalog-overrides";
import { isEmptyVariantOverride } from "@/domain/part-editor";
import { hasUsdPrice } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { regroupNow } from "@/lib/regroup";

/**
 * The admin's catalog fixes (S15). Each one is stored in its own table and the
 * catalog is regrouped at once (about 10 s), the same way the nightly sync applies it.
 */
async function regroup() {
  await regroupNow();
  revalidateTag("catalog", "max");
  revalidatePath("/admin/catalog");
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const productInput = z.object({
  productId: z.uuid(),
  hidden: z.literal("on").optional(),
  alone: z.literal("on").optional(),
  categoryId: z.union([z.uuid(), z.literal("")]),
  images: z.string().max(5000),
  main: z.string().max(1000).optional(),
  mergeWith: z.string().trim().max(200),
  pinRank: z.union([z.coerce.number().int().min(1).max(999), z.literal("")]),
  note: z.string().trim().max(500),
});

/** Saves one product's override from its form; a form with nothing set deletes it. */
export async function saveProductOverride(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const parsed = productInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "אחד השדות לא תקין" };
  const input = parsed.data;

  let images = input.images
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^https:\/\//.test(s));
  if (input.main) {
    const [product] = await db.select({ images: schema.products.images }).from(schema.products).where(eq(schema.products.id, input.productId));
    const all = images.length ? images : (product?.images ?? []);
    images = [input.main, ...all.filter((u) => u !== input.main)];
  }

  const [current] = await db.select().from(schema.productOverrides).where(eq(schema.productOverrides.productId, input.productId));
  let mergeKey = current?.mergeKey ?? null;
  if (input.mergeWith === "") mergeKey = null;
  else if (input.mergeWith !== current?.mergeKey) {
    const target = await mergeTarget(input.mergeWith);
    if (!target) return { ok: false, error: "לא נמצאה משפחה או מק״ט לאיחוד" };
    mergeKey = target.mergeKey;
    if (target.primaryProductId !== input.productId) {
      await db
        .insert(schema.productOverrides)
        .values({ productId: target.primaryProductId, mergeKey, updatedBy: viewer.id })
        .onConflictDoUpdate({ target: schema.productOverrides.productId, set: { mergeKey, updatedAt: new Date(), updatedBy: viewer.id } });
    }
  }

  const values = {
    hidden: input.hidden === "on",
    images: images.length ? images : null,
    categoryId: input.categoryId || null,
    alone: input.alone === "on",
    mergeKey,
    pinRank: input.pinRank === "" ? null : input.pinRank,
    note: input.note || null,
  };
  // The name, description and availability set in /admin/settings/products (S16c) keep the row.
  const editorFields = current && (current.title !== null || current.descriptionHtml !== null || current.available !== null);
  if (isEmptyOverride({ ...values, categorySlug: values.categoryId }) && !values.note && !editorFields) {
    await db.delete(schema.productOverrides).where(eq(schema.productOverrides.productId, input.productId));
  } else {
    await db
      .insert(schema.productOverrides)
      .values({ productId: input.productId, ...values, updatedBy: viewer.id })
      .onConflictDoUpdate({ target: schema.productOverrides.productId, set: { ...values, updatedAt: new Date(), updatedBy: viewer.id } });
  }
  await regroup();
  return { ok: true };
}

/**
 * What to merge into: a family's slug (or its page link) or a SKU in it. Uses the
 * family's existing merge key when it has one, else its slug, on its primary product.
 */
async function mergeTarget(text: string) {
  const slug = text.replace(/^.*\/catalog\/p\//, "").replace(/[?#].*$/, "");
  const rows = await db.execute<{ id: string; slug: string; primary_product_id: string; merge_key: string | null }>(sql`
    SELECT f.id, f.slug, f.primary_product_id, o.merge_key
      FROM product_families f
      LEFT JOIN product_overrides o ON o.product_id = f.primary_product_id
     WHERE f.missing_since IS NULL
       AND (f.slug = ${slug} OR f.id IN (SELECT family_id FROM variants WHERE upper(supplier_sku) = upper(${text})))
     LIMIT 1`);
  const row = rows.rows[0];
  if (!row?.primary_product_id) return null;
  return { primaryProductId: row.primary_product_id, mergeKey: row.merge_key ?? row.slug };
}

const priceInput = z.object({ variantId: z.uuid(), priceUsd: z.string().trim().max(20) });

/** Sets a variant's USD price, or clears it (empty) so the store's price comes back. */
export async function saveVariantPrice(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await requireAdmin();
  const parsed = priceInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "מחיר לא תקין" };
  const { variantId, priceUsd } = parsed.data;
  if (priceUsd === "") {
    // Only the price goes; a fixed ₪ price, SKU, options or hiding from /admin/settings/products stays.
    const [row] = await db.update(schema.variantOverrides).set({ priceUsd: null }).where(eq(schema.variantOverrides.variantId, variantId)).returning();
    if (row && isEmptyVariantOverride({ ...row, hidden: row.hidden })) await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantId, variantId));
  } else {
    if (!hasUsdPrice(priceUsd) || Number(priceUsd) > 100_000) return { ok: false, error: "מחיר בדולרים, גדול מ-0" };
    const price = Number(priceUsd).toFixed(2);
    await db
      .insert(schema.variantOverrides)
      .values({ variantId, priceUsd: price, updatedBy: viewer.id })
      .onConflictDoUpdate({ target: schema.variantOverrides.variantId, set: { priceUsd: price, updatedAt: new Date(), updatedBy: viewer.id } });
  }
  await regroup();
  return { ok: true };
}

type ProductRow = typeof schema.productOverrides.$inferSelect;
type VariantRow = typeof schema.variantOverrides.$inferSelect;
export type RemovedOverride = { kind: "product"; row: ProductRow } | { kind: "variant"; row: VariantRow };

/** Removes an override and hands it back, so the Undo toast can put it back as it was. */
export async function removeOverride(kind: "product" | "variant", id: string): Promise<RemovedOverride | null> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return null;
  let removed: RemovedOverride | null = null;
  if (kind === "product") {
    const [row] = await db.delete(schema.productOverrides).where(eq(schema.productOverrides.productId, id)).returning();
    if (row) removed = { kind, row };
  } else {
    const [row] = await db.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantId, id)).returning();
    if (row) removed = { kind, row };
  }
  if (removed) await regroup();
  return removed;
}

export async function restoreOverride(removed: RemovedOverride) {
  await requireAdmin();
  if (removed.kind === "product") {
    const row = { ...removed.row, updatedAt: new Date(removed.row.updatedAt) };
    await db.insert(schema.productOverrides).values(row).onConflictDoNothing();
  } else {
    const row = { ...removed.row, updatedAt: new Date(removed.row.updatedAt) };
    await db.insert(schema.variantOverrides).values(row).onConflictDoNothing();
  }
  await regroup();
}

const categoryInput = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(60) });

/** Renames a category. Only migrations write category names, so nothing overwrites it. */
export async function renameCategory(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = categoryInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "שם לא תקין" };
  await db.update(schema.categories).set({ name: parsed.data.name }).where(eq(schema.categories.id, parsed.data.id));
  revalidateTag("catalog", "max");
  revalidatePath("/admin/catalog");
  return { ok: true };
}
