"use server";

import { inArray, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { mergeTarget } from "@/lib/product-admin";
import { regroupNow } from "@/lib/regroup";

/**
 * "מומלץ" pins (S15, edited only here since the catalog tab folded into settings). A pin is
 * product_overrides.pin_rank on a family's primary product; each regroup gives the family
 * its lowest pin (product_families.pinned_rank). Every change regroups and writes audit_log.
 */

export type PinResult = { ok: true; message: string; removed?: PinRow[] } | { ok: false; error: string };
export type PinRow = { productId: string; pinRank: number };

async function refresh() {
  await regroupNow();
  updateTag("catalog");
  revalidatePath("/", "layout");
}

/** Sets pin_rank, dropping the override row when nothing else is left in it. */
async function writePin(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], productId: string, pinRank: number | null, actorId: string) {
  await tx
    .insert(schema.productOverrides)
    .values({ productId, pinRank, updatedBy: actorId })
    .onConflictDoUpdate({ target: schema.productOverrides.productId, set: { pinRank, updatedAt: new Date(), updatedBy: actorId } });
  await tx.execute(sql`
    DELETE FROM product_overrides WHERE product_id = ${productId}
       AND NOT hidden AND images IS NULL AND category_id IS NULL AND NOT alone AND merge_key IS NULL AND pin_rank IS NULL
       AND note IS NULL AND title IS NULL AND description_html IS NULL AND available IS NULL`);
}

const pinInput = z.object({ family: z.string().trim().min(1).max(300), rank: z.coerce.number().int().min(1).max(999) });

/** Pins a family (its page link, slug or a SKU in it) at a place in "מומלץ". */
export async function savePin(formData: FormData): Promise<PinResult> {
  const viewer = await requireAdmin();
  const parsed = pinInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "צריך קישור, slug או מק״ט, ומקום מ-1 עד 999" };
  const target = await mergeTarget(parsed.data.family);
  if (!target) return { ok: false, error: "לא נמצאה משפחה" };
  await db.transaction(async (tx) => {
    await writePin(tx, target.primaryProductId, parsed.data.rank, viewer.id);
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "product", entityId: target.primaryProductId, action: "pin", before: null, after: { pinRank: parsed.data.rank } });
  });
  await refresh();
  return { ok: true, message: `הוצמד במקום ${parsed.data.rank}` };
}

/** Unpins a family (every pinned product in it) and hands the pins back for Undo. */
export async function removePin(slug: string): Promise<PinResult> {
  const viewer = await requireAdmin();
  const { rows } = await db.execute<{ product_id: string; pin_rank: number }>(sql`
    SELECT DISTINCT o.product_id, o.pin_rank FROM product_overrides o
      JOIN variants v ON v.product_id = o.product_id JOIN product_families f ON f.id = v.family_id
     WHERE f.slug = ${slug} AND o.pin_rank IS NOT NULL`);
  if (!rows.length) return { ok: false, error: "המשפחה לא מוצמדת" };
  const removed = rows.map((r) => ({ productId: r.product_id, pinRank: r.pin_rank }));
  await db.transaction(async (tx) => {
    for (const r of removed) await writePin(tx, r.productId, null, viewer.id);
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "product", entityId: removed[0].productId, action: "unpin", before: removed, after: null });
  });
  await refresh();
  return { ok: true, message: "ההצמדה הוסרה", removed };
}

export async function restorePins(rows: PinRow[]): Promise<PinResult> {
  const viewer = await requireAdmin();
  const valid = rows.filter((r) => z.uuid().safeParse(r.productId).success && Number.isInteger(r.pinRank));
  if (!valid.length) return { ok: false, error: "לא תקין" };
  const exists = await db.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, valid.map((r) => r.productId)));
  const ids = new Set(exists.map((e) => e.id));
  await db.transaction(async (tx) => {
    for (const r of valid) if (ids.has(r.productId)) await writePin(tx, r.productId, r.pinRank, viewer.id);
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "product", entityId: valid[0].productId, action: "pin", before: null, after: valid });
  });
  await refresh();
  return { ok: true, message: "ההצמדה חזרה" };
}

