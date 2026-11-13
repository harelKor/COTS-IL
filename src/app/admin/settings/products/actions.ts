"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  customHandle,
  isEmptyVariantOverride,
  partRemoval,
  readOptions,
  sameDescription,
  textToHtml,
  variantOverrideFields,
  variantRemoval,
} from "@/domain/part-editor";
import { requireAdmin } from "@/lib/auth";
import { orderLineCount } from "@/lib/product-admin";
import { regroupNow } from "@/lib/regroup";
import { createClient } from "@/lib/supabase/server";

/**
 * מוצרים (S16c). A synced part's edits go to product_overrides / variant_overrides, which
 * each sync and regroup lay over the store's values again; a custom part's edits are its
 * own values. Every save writes audit_log with a snapshot, regroups (about 10 s) and
 * expires `catalog`, and can be undone from that snapshot.
 */

const PATH = "/admin/settings/products";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PartResult = { ok: true; message: string; undo?: number; id?: string } | { ok: false; error: string };

async function refresh() {
  await regroupNow();
  updateTag("catalog");
  revalidatePath("/", "layout");
  revalidatePath(PATH);
}

const money = (max: number) => z.union([z.literal(""), z.coerce.number().positive().max(max)]);

const variantInput = z.object({
  id: z.uuid().nullable(),
  values: z.array(z.string().max(120)).max(3),
  sku: z.string().trim().max(80),
  priceUsd: money(100_000),
  fixedIls: money(1_000_000),
  hidden: z.boolean(),
  remove: z.boolean(),
});

const partInput = z.object({
  productId: z.union([z.uuid(), z.literal("")]),
  supplierId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000),
  url: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(2000)]),
  categoryId: z.union([z.uuid(), z.literal("")]),
  availability: z.enum(["store", "yes", "no"]),
  hidden: z.boolean(),
  images: z.array(z.url({ protocol: /^https$/ }).max(2000)).max(20),
  optionNames: z.array(z.string().trim().max(60)).max(3),
  variants: z.array(variantInput).min(1).max(200),
});

function readPart(formData: FormData) {
  const json = (key: string) => {
    try {
      return JSON.parse(String(formData.get(key) ?? "null"));
    } catch {
      return null;
    }
  };
  return partInput.safeParse({
    productId: formData.get("productId") ?? "",
    supplierId: formData.get("supplierId"),
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    url: formData.get("url") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    availability: formData.get("availability") ?? "store",
    hidden: formData.get("hidden") === "on",
    images: json("images") ?? [],
    optionNames: json("optionNames") ?? [],
    variants: json("variants") ?? [],
  });
}

const FIELD_NAMES: Record<string, string> = {
  title: "שם",
  description: "תיאור",
  url: "קישור",
  images: "תמונות",
  variants: "גרסאות (מחיר בדולרים או ₪ גדול מ-0)",
  optionNames: "שמות האפשרויות",
};

function invalid(error: z.ZodError): PartResult {
  const fields = [...new Set(error.issues.map((i) => FIELD_NAMES[String(i.path[0])] ?? String(i.path[0])))];
  return { ok: false, error: `לא תקין: ${fields.join(", ")}` };
}

/** Everything a save can change, so Undo can put it back. */
type Snapshot = {
  product: { id: string; title: string; descriptionHtml: string | null; images: string[]; storeTitle: string | null; storeDescriptionHtml: string | null; storeImages: string[] | null; categoryId: string | null; url: string; searchText: string };
  override: typeof schema.productOverrides.$inferSelect | null;
  variants: { id: string; supplierSku: string | null; options: { name: string; value: string }[]; supplierPriceUsd: string | null; storeSku: string | null; storeOptions: { name: string; value: string }[] | null; position: number }[];
  variantOverrides: (typeof schema.variantOverrides.$inferSelect)[];
};

async function snapshot(tx: Tx, productId: string): Promise<Snapshot | null> {
  const [product] = await tx
    .select({
      id: schema.products.id,
      title: schema.products.title,
      descriptionHtml: schema.products.descriptionHtml,
      images: schema.products.images,
      storeTitle: schema.products.storeTitle,
      storeDescriptionHtml: schema.products.storeDescriptionHtml,
      storeImages: schema.products.storeImages,
      categoryId: schema.products.categoryId,
      url: schema.products.url,
      searchText: schema.products.searchText,
    })
    .from(schema.products)
    .where(eq(schema.products.id, productId));
  if (!product) return null;
  const [override] = await tx.select().from(schema.productOverrides).where(eq(schema.productOverrides.productId, productId));
  const variants = await tx
    .select({
      id: schema.variants.id,
      supplierSku: schema.variants.supplierSku,
      options: schema.variants.options,
      supplierPriceUsd: schema.variants.supplierPriceUsd,
      storeSku: schema.variants.storeSku,
      storeOptions: schema.variants.storeOptions,
      position: schema.variants.position,
    })
    .from(schema.variants)
    .where(eq(schema.variants.productId, productId));
  const variantOverrides = variants.length
    ? await tx.select().from(schema.variantOverrides).where(inArray(schema.variantOverrides.variantId, variants.map((v) => v.id)))
    : [];
  return { product, override: override ?? null, variants, variantOverrides };
}

async function audit(tx: Tx, actorId: string, productId: string, action: string, before: Snapshot | null, after: Snapshot | null) {
  const [row] = await tx
    .insert(schema.auditLog)
    .values({ actorId, entity: "product", entityId: productId, action, before, after })
    .returning({ id: schema.auditLog.id });
  return row.id;
}

/** Writes a product override, or deletes it when nothing in it is set (S15 fields included). */
async function writeProductOverride(tx: Tx, productId: string, actorId: string, values: Partial<typeof schema.productOverrides.$inferInsert>) {
  const [current] = await tx.select().from(schema.productOverrides).where(eq(schema.productOverrides.productId, productId));
  const next = { ...(current ?? {}), ...values };
  const empty =
    !next.hidden && !next.images?.length && !next.categoryId && !next.alone && !next.mergeKey && (next.pinRank ?? null) === null && !next.note && next.title == null && next.descriptionHtml == null && next.available == null;
  if (empty) {
    await tx.delete(schema.productOverrides).where(eq(schema.productOverrides.productId, productId));
    return;
  }
  await tx
    .insert(schema.productOverrides)
    .values({ productId, ...values, updatedBy: actorId })
    .onConflictDoUpdate({ target: schema.productOverrides.productId, set: { ...values, updatedAt: new Date(), updatedBy: actorId } });
}

async function writeVariantOverride(tx: Tx, variantId: string, actorId: string, values: { priceUsd: string | null; fixedIls: string | null; sku: string | null; options: { name: string; value: string }[] | null; hidden: boolean }) {
  if (isEmptyVariantOverride(values)) {
    await tx.delete(schema.variantOverrides).where(eq(schema.variantOverrides.variantId, variantId));
    return;
  }
  await tx
    .insert(schema.variantOverrides)
    .values({ variantId, ...values, updatedBy: actorId })
    .onConflictDoUpdate({ target: schema.variantOverrides.variantId, set: { ...values, updatedAt: new Date(), updatedBy: actorId } });
}

function searchTextOf(title: string, supplierName: string, variants: { sku: string | null; options: { value: string }[] }[]) {
  return [title, supplierName, ...variants.flatMap((v) => [v.sku, ...v.options.map((o) => o.value)])].filter(Boolean).join(" ").toLowerCase();
}

/** Saves the edit window: an existing part (synced or custom) or a new custom part ("הוספת חלק"). */
export async function savePart(_: PartResult | null, formData: FormData): Promise<PartResult> {
  const viewer = await requireAdmin();
  const parsed = readPart(formData);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const names = d.optionNames.map((n) => n.trim());
  const variants = d.variants.map((v) => ({ ...v, options: readOptions(names, v.values), sku: v.sku || null }));
  if (variants.some((v) => !v.remove && v.fixedIls !== "" && v.priceUsd === "" && !v.id)) {
    return { ok: false, error: "לחלק עם מחיר ₪ קבוע צריך גם מחיר ספק בדולרים, להזמנה מהספק" };
  }
  const [supplier] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, d.supplierId));
  if (!supplier) return { ok: false, error: "הספק לא נמצא" };
  const availability = d.availability === "store" ? null : d.availability === "yes";

  if (!d.productId) return createPart(viewer.id, supplier, d, variants, availability);

  const result = await db.transaction(async (tx) => {
    const before = await snapshot(tx, d.productId);
    if (!before) return { ok: false as const, error: "החלק לא נמצא" };
    const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, d.productId)).for("update");
    if (product.supplierId !== d.supplierId) return { ok: false as const, error: "החלק לא שייך לספק הזה" };
    const custom = product.source === "custom";
    const byId = new Map(before.variants.map((v) => [v.id, v]));
    if (variants.some((v) => v.id && !byId.has(v.id))) return { ok: false as const, error: "גרסה לא שייכת לחלק" };
    let removedForGood = false;

    if (custom) {
      const description = textToHtml(d.description);
      await tx
        .update(schema.products)
        .set({
          title: d.title,
          storeTitle: d.title,
          descriptionHtml: description,
          storeDescriptionHtml: description,
          images: d.images,
          storeImages: d.images,
          categoryId: d.categoryId || null,
          url: d.url || supplier.baseUrl,
          searchText: searchTextOf(d.title, supplier.name, variants.filter((v) => !v.remove)),
        })
        .where(eq(schema.products.id, product.id));
      await writeProductOverride(tx, product.id, viewer.id, { hidden: d.hidden, available: availability });

      let position = 0;
      for (const v of variants) {
        if (v.remove) {
          if (!v.id) continue;
          if (variantRemoval({ source: "custom", orderLines: await orderLineCount([v.id]) }) === "delete") {
            await tx.delete(schema.variants).where(eq(schema.variants.id, v.id));
            removedForGood = true;
          } else await writeVariantOverride(tx, v.id, viewer.id, { priceUsd: null, fixedIls: null, sku: null, options: null, hidden: true });
          continue;
        }
        const price = v.priceUsd === "" ? null : v.priceUsd.toFixed(2);
        const values = { supplierSku: v.sku, storeSku: v.sku, options: v.options, storeOptions: v.options, supplierPriceUsd: price, priceUsd: price, position: position++ };
        let id = v.id;
        if (id) await tx.update(schema.variants).set(values).where(eq(schema.variants.id, id));
        else {
          const [row] = await tx
            .insert(schema.variants)
            .values({ ...values, supplierId: supplier.id, productId: product.id, supplierVariantId: `custom-${randomUUID()}`, storeAvailable: null, checkedAt: new Date() })
            .returning({ id: schema.variants.id });
          id = row.id;
        }
        await writeVariantOverride(tx, id, viewer.id, { priceUsd: null, fixedIls: v.fixedIls === "" ? null : v.fixedIls.toFixed(2), sku: null, options: null, hidden: v.hidden });
      }
    } else {
      const titleOverride = d.title !== (product.storeTitle ?? product.title) ? d.title : null;
      const descriptionOverride = sameDescription(product.storeDescriptionHtml, d.description) ? null : (textToHtml(d.description) ?? "");
      const storeImages = product.storeImages ?? [];
      const imagesOverride = d.images.length === storeImages.length && d.images.every((u, i) => u === storeImages[i]) ? null : d.images;
      await writeProductOverride(tx, product.id, viewer.id, {
        title: titleOverride,
        descriptionHtml: descriptionOverride,
        images: imagesOverride,
        categoryId: d.categoryId && d.categoryId !== product.categoryId ? d.categoryId : null,
        available: availability,
        hidden: d.hidden,
      });
      for (const v of variants) {
        const store = v.id ? byId.get(v.id) : undefined;
        if (!store) continue; // a synced part's variants come from the store; none are added here
        const fields = variantOverrideFields(
          { sku: store.storeSku, options: store.storeOptions ?? store.options, priceUsd: store.supplierPriceUsd },
          { sku: v.sku, options: v.options, priceUsd: v.priceUsd === "" ? null : String(v.priceUsd), fixedIls: v.fixedIls === "" ? null : v.fixedIls, hidden: v.hidden || v.remove },
        );
        const [old] = before.variantOverrides.filter((o) => o.variantId === store.id);
        await writeVariantOverride(tx, store.id, viewer.id, fields);
        if (old?.note) await tx.update(schema.variantOverrides).set({ note: old.note }).where(eq(schema.variantOverrides.variantId, store.id));
      }
    }

    const after = await snapshot(tx, product.id);
    const auditId = await audit(tx, viewer.id, product.id, "update", before, after);
    return { ok: true as const, auditId, removedForGood };
  });
  if (!result.ok) return result;
  await refresh();
  // A deleted variant can't come back, so that save has no Undo.
  return { ok: true, message: "נשמר. האתר מעודכן.", undo: result.removedForGood ? undefined : result.auditId };
}

async function createPart(
  actorId: string,
  supplier: typeof schema.suppliers.$inferSelect,
  d: z.infer<typeof partInput>,
  variants: (Omit<z.infer<typeof variantInput>, "sku"> & { options: { name: string; value: string }[]; sku: string | null })[],
  availability: boolean | null,
): Promise<PartResult> {
  const live = variants.filter((v) => !v.remove);
  if (!live.length) return { ok: false, error: "צריך גרסה אחת לפחות" };
  const id = await db.transaction(async (tx) => {
    const description = textToHtml(d.description);
    const now = new Date();
    const [product] = await tx
      .insert(schema.products)
      .values({
        supplierId: supplier.id,
        supplierProductId: `custom-${randomUUID()}`,
        source: "custom",
        handle: customHandle(d.title),
        title: d.title,
        storeTitle: d.title,
        descriptionHtml: description,
        storeDescriptionHtml: description,
        url: d.url || supplier.baseUrl,
        images: d.images,
        storeImages: d.images,
        programs: supplier.programs,
        categoryId: d.categoryId || null,
        status: "published",
        searchText: searchTextOf(d.title, supplier.name, live),
        lastSeenAt: now,
      })
      .returning({ id: schema.products.id });
    let position = 0;
    for (const v of live) {
      const price = v.priceUsd === "" ? null : v.priceUsd.toFixed(2);
      const [row] = await tx
        .insert(schema.variants)
        .values({
          supplierId: supplier.id,
          productId: product.id,
          supplierVariantId: `custom-${randomUUID()}`,
          supplierSku: v.sku,
          storeSku: v.sku,
          options: v.options,
          storeOptions: v.options,
          position: position++,
          priceUsd: price,
          supplierPriceUsd: price,
          storeAvailable: null,
          checkedAt: now,
        })
        .returning({ id: schema.variants.id });
      await writeVariantOverride(tx, row.id, actorId, { priceUsd: null, fixedIls: v.fixedIls === "" ? null : v.fixedIls.toFixed(2), sku: null, options: null, hidden: v.hidden });
    }
    await writeProductOverride(tx, product.id, actorId, { hidden: d.hidden, available: availability });
    await audit(tx, actorId, product.id, "create", null, await snapshot(tx, product.id));
    return product.id;
  });
  await refresh();
  return { ok: true, message: `${d.title} נוסף לחנות של ${supplier.name}`, id };
}

/** Undo for a save or "חזרה לנתוני הספק": puts the part back as the audit row's snapshot has it. */
export async function undoPartChange(auditId: number): Promise<PartResult> {
  const viewer = await requireAdmin();
  if (!Number.isInteger(auditId)) return { ok: false, error: "לא תקין" };
  const done = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.auditLog).where(and(eq(schema.auditLog.id, auditId), eq(schema.auditLog.entity, "product")));
    const before = row?.before as Snapshot | null;
    if (!row || !before) return false;
    const now = await snapshot(tx, before.product.id);
    if (!now) return false;
    const { id, ...product } = before.product;
    await tx.update(schema.products).set(product).where(eq(schema.products.id, id));
    await tx.delete(schema.productOverrides).where(eq(schema.productOverrides.productId, id));
    if (before.override) await tx.insert(schema.productOverrides).values({ ...before.override, updatedAt: new Date(before.override.updatedAt) });
    const keep = new Set(before.variants.map((v) => v.id));
    // Variants the save added to a custom part go again (nobody can have ordered them in these seconds; checked anyway).
    for (const v of now.variants) if (!keep.has(v.id) && (await orderLineCount([v.id])) === 0) await tx.delete(schema.variants).where(eq(schema.variants.id, v.id));
    for (const v of before.variants) {
      const { id: vid, ...values } = v;
      await tx.update(schema.variants).set(values).where(eq(schema.variants.id, vid));
    }
    if (before.variants.length) await tx.delete(schema.variantOverrides).where(inArray(schema.variantOverrides.variantId, [...keep]));
    for (const o of before.variantOverrides) await tx.insert(schema.variantOverrides).values({ ...o, updatedAt: new Date(o.updatedAt) }).onConflictDoNothing();
    await audit(tx, viewer.id, id, "undo", now, before);
    return true;
  });
  if (!done) return { ok: false, error: "אי אפשר לבטל את השינוי הזה" };
  await refresh();
  return { ok: true, message: "השינוי בוטל" };
}

/** "חזרה לנתוני הספק": drops the admin's name, description, photos, category, availability and variant edits; hiding stays. */
export async function revertPart(productId: string): Promise<PartResult> {
  const viewer = await requireAdmin();
  if (!z.uuid().safeParse(productId).success) return { ok: false, error: "לא תקין" };
  const auditId = await db.transaction(async (tx) => {
    const before = await snapshot(tx, productId);
    if (!before) return null;
    await writeProductOverride(tx, productId, viewer.id, { title: null, descriptionHtml: null, images: null, categoryId: null, available: null });
    for (const o of before.variantOverrides) {
      await writeVariantOverride(tx, o.variantId, viewer.id, { priceUsd: null, fixedIls: null, sku: null, options: null, hidden: o.hidden });
    }
    return audit(tx, viewer.id, productId, "revert", before, await snapshot(tx, productId));
  });
  if (auditId === null) return { ok: false, error: "החלק לא נמצא" };
  await refresh();
  return { ok: true, message: "החלק חזר לנתוני הספק", undo: auditId };
}

/** "מחיקה": a custom part nobody ordered is deleted; anything else is hidden (with Undo). */
export async function removePart(productId: string): Promise<PartResult> {
  const viewer = await requireAdmin();
  if (!z.uuid().safeParse(productId).success) return { ok: false, error: "לא תקין" };
  const result = await db.transaction(async (tx) => {
    const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, productId)).for("update");
    if (!product) return null;
    const before = await snapshot(tx, productId);
    // Counted inside the lock, so an order sent a moment ago still wins.
    const {
      rows: [refs],
    } = await tx.execute<{ n: number }>(sql`
      SELECT (SELECT count(*)::int FROM team_order_items i JOIN variants v ON v.id = i.variant_id WHERE v.product_id = ${productId})
           + (SELECT count(*)::int FROM po_lines l JOIN variants v ON v.id = l.variant_id WHERE v.product_id = ${productId}) AS n`);
    const action = partRemoval({ source: product.source, orderLines: refs.n });
    if (action === "delete") {
      // Variants, cart lines, price history, specs and overrides go with it (ON DELETE CASCADE).
      await tx.delete(schema.products).where(eq(schema.products.id, productId));
      await audit(tx, viewer.id, productId, "delete", before, null);
      return { action, title: product.title, auditId: null };
    }
    await writeProductOverride(tx, productId, viewer.id, { hidden: true });
    return { action, title: product.title, auditId: await audit(tx, viewer.id, productId, "hide", before, await snapshot(tx, productId)) };
  });
  if (!result) return { ok: false, error: "החלק לא נמצא" };
  await refresh();
  return result.action === "delete"
    ? { ok: true, message: `${result.title} נמחק` }
    : { ok: true, message: `${result.title} הוסתר. יש לו הזמנות או שהוא מגיע מהספק, אז הוא לא נמחק.`, undo: result.auditId ?? undefined };
}

const PHOTO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Uploads one photo to the public `product-images` bucket as the signed-in admin (storage policies check is_admin). */
export async function uploadPartPhoto(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "לא נבחר קובץ" };
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { ok: false, error: "התמונה צריכה להיות PNG, JPG או WebP" };
  if (file.size > 700 * 1024) return { ok: false, error: "התמונה גדולה מ-700KB" };
  const supabase = await createClient();
  const path = `${randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
  if (error) return { ok: false, error: `ההעלאה נכשלה: ${error.message}` };
  return { ok: true, url: supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl };
}

