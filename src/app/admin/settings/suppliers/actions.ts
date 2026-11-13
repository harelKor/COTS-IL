"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { normalizeStoreUrl, SUPPLIER_CODE, type SupplierDraft } from "@/domain/supplier-detect";
import { parseSettings } from "@/domain/settings";
import { accentColor } from "@/domain/vendors";
import { requireAdmin } from "@/lib/auth";
import { regroupNow } from "@/lib/regroup";
import { createClient } from "@/lib/supabase/server";
import { detectStore, dispatchSync, latestSyncJob, supplierReferences, type SyncJobView } from "@/lib/supplier-admin";
import type { SettingsResult } from "../actions";

/**
 * ספקים (S16b). Every change checks the admin first and writes audit_log. Hiding,
 * deleting and a new multiplier regroup the catalog (about 10 s) and expire `catalog`,
 * so the site shows the change without a deploy.
 */

const PATH = "/admin/settings/suppliers";

async function refreshCatalog() {
  await regroupNow();
  updateTag("catalog");
  updateTag("settings");
  revalidatePath("/", "layout");
}

export type DetectResult = { ok: true; draft: SupplierDraft } | { ok: false; error: string };

/** Step 1 of adding: read the store at the URL. */
export async function detectSupplier(url: string): Promise<DetectResult> {
  await requireAdmin();
  if (!normalizeStoreUrl(url)) return { ok: false, error: "כתובת לא תקינה. הדביקו את כתובת החנות, למשל revrobotics.com" };
  const draft = await detectStore(url);
  if (!draft) return { ok: false, error: "לא הצלחנו לקרוא את הכתובת" };
  const [dupe] = await db.select({ name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.baseUrl, draft.baseUrl));
  if (dupe) return { ok: false, error: `הספק כבר קיים: ${dupe.name}` };
  return { ok: true, draft };
}

const optionalUrl = z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(2000)]);
const optionalNumber = (max: number) => z.union([z.literal(""), z.coerce.number().min(0).max(max)]);

const supplierInput = z.object({
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().trim().min(1),
  logoUrl: optionalUrl,
  programs: z.array(z.enum(["FRC", "FTC"])).min(1),
});

function readPrograms(formData: FormData) {
  return formData.getAll("programs").map(String);
}

/** Step 2: save the checked form. A Shopify supplier starts syncing at once when GitHub is set up. */
export async function createSupplier(_: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const parsed = supplierInput
    .extend({ code: z.string().trim().toLowerCase().regex(SUPPLIER_CODE), platform: z.enum(["shopify", "manual"]) })
    .safeParse({ ...Object.fromEntries(formData), programs: readPrograms(formData) });
  if (!parsed.success) return { ok: false, error: "בדקו את השם, הקוד (אותיות קטנות באנגלית וספרות), הכתובת ותוכנית אחת לפחות" };
  const baseUrl = normalizeStoreUrl(parsed.data.baseUrl);
  if (!baseUrl) return { ok: false, error: "כתובת החנות לא תקינה" };
  const { code, name, platform, programs, logoUrl } = parsed.data;

  const created = await db.transaction(async (tx) => {
    const [taken] = await tx
      .select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(sql`${schema.suppliers.code} = ${code} OR ${schema.suppliers.baseUrl} = ${baseUrl}`);
    if (taken) return null;
    const [row] = await tx.insert(schema.suppliers).values({ code, name, baseUrl, platform, programs, logoUrl: logoUrl || null }).returning();
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "supplier", entityId: row.id, action: "create", before: null, after: row });
    return row;
  });
  if (!created) return { ok: false, error: "כבר יש ספק עם הקוד או הכתובת האלה" };
  revalidatePath(PATH);

  if (platform !== "shopify") return { ok: true, message: `${name} נוסף כספק ידני. החלקים שלו יתווספו ידנית.` };
  const sync = await dispatchSync(code);
  return { ok: true, message: sync.ok ? `${name} נוסף והסנכרון התחיל` : `${name} נוסף. הסנכרון יתחיל בלילה (${sync.error})` };
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Uploads a logo to the public `supplier-logos` bucket as the signed-in admin (storage policies check is_admin). */
async function uploadLogo(code: string, file: File): Promise<string | { error: string }> {
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: "הלוגו צריך להיות PNG, JPG או WebP" };
  // Server actions take up to 1 MB in all, so the file stays well under that.
  if (file.size > 700 * 1024) return { error: "הלוגו גדול מ-700KB" };
  const supabase = await createClient();
  const path = `${code}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("supplier-logos").upload(path, file, { contentType: file.type, upsert: true });
  if (error) return { error: `ההעלאה נכשלה: ${error.message}` };
  return supabase.storage.from("supplier-logos").getPublicUrl(path).data.publicUrl;
}

const editInput = supplierInput.extend({
  id: z.uuid(),
  leadMin: optionalNumber(365),
  leadMax: optionalNumber(365),
  multiplier: z.union([z.literal(""), z.coerce.number().min(1).max(5)]),
  freeShippingUsd: optionalNumber(100000),
  notes: z.string().trim().max(2000),
  accentColor: z.union([z.literal(""), z.string().trim().regex(/^#[0-9a-fA-F]{6}$/)]).default(""),
});

/** Saves one supplier's card: details, lead time (פרטי העסק), multiplier (pricing_rules), shipping, notes, nightly sync. */
export async function updateSupplier(_: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const parsed = editInput.safeParse({ ...Object.fromEntries(formData), programs: readPrograms(formData) });
  if (!parsed.success) return { ok: false, error: `לא תקין: ${[...new Set(parsed.error.issues.map((i) => LABELS[String(i.path[0])] ?? String(i.path[0])))].join(", ")}` };
  const d = parsed.data;
  const baseUrl = normalizeStoreUrl(d.baseUrl);
  if (!baseUrl) return { ok: false, error: "כתובת החנות לא תקינה" };
  if ((d.leadMin === "") !== (d.leadMax === "") || (d.leadMin !== "" && d.leadMax !== "" && d.leadMax < d.leadMin)) {
    return { ok: false, error: "זמן אספקה: מלאו מינימום ומקסימום (המקסימום לא קטן מהמינימום), או השאירו את שניהם ריקים" };
  }

  const [before] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.id, d.id));
  if (!before) return { ok: false, error: "הספק לא נמצא" };

  let logoUrl: string | null = d.logoUrl || null;
  const file = formData.get("logoFile");
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadLogo(before.code, file);
    if (typeof uploaded !== "string") return { ok: false, error: uploaded.error };
    logoUrl = uploaded;
  }

  const multiplier = d.multiplier === "" ? null : d.multiplier;
  const repriced = await db.transaction(async (tx) => {
    const [after] = await tx
      .update(schema.suppliers)
      .set({
        name: d.name,
        baseUrl,
        logoUrl,
        accentColor: accentColor(d.accentColor),
        programs: d.programs,
        freeShippingUsd: d.freeShippingUsd === "" ? null : String(d.freeShippingUsd),
        notes: d.notes || null,
        syncEnabled: formData.get("syncEnabled") === "on",
      })
      .where(eq(schema.suppliers.id, d.id))
      .returning();
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "supplier", entityId: d.id, action: "update", before, after });

    // Lead time lives with the other business facts (site_settings.business.leadTimes, keyed by code).
    const [row] = await tx.select({ data: schema.siteSettings.data }).from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).for("update");
    const settings = parseSettings(row?.data);
    const lead = d.leadMin === "" || d.leadMax === "" ? null : { minDays: Math.round(d.leadMin), maxDays: Math.round(d.leadMax) };
    const oldLead = settings.business.leadTimes[before.code] ?? null;
    if (JSON.stringify(oldLead) !== JSON.stringify(lead)) {
      const next = { ...settings, business: { ...settings.business, leadTimes: { ...settings.business.leadTimes, [before.code]: lead } } };
      await tx
        .insert(schema.siteSettings)
        .values({ id: 1, data: next, updatedBy: viewer.id })
        .onConflictDoUpdate({ target: schema.siteSettings.id, set: { data: next, updatedAt: new Date(), updatedBy: viewer.id } });
      await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "site_settings", entityId: "1", action: "update_lead_time", before: { [before.code]: oldLead }, after: { [before.code]: lead } });
    }

    const rule = and(eq(schema.pricingRules.scope, "supplier"), eq(schema.pricingRules.targetId, d.id));
    const [oldRule] = await tx.select().from(schema.pricingRules).where(rule);
    if ((oldRule ? Number(oldRule.multiplier) : null) === multiplier) return false;
    if (multiplier === null) {
      await tx.delete(schema.pricingRules).where(rule);
    } else {
      await tx
        .insert(schema.pricingRules)
        .values({ scope: "supplier", targetId: d.id, multiplier: String(multiplier), updatedBy: viewer.id })
        .onConflictDoUpdate({ target: [schema.pricingRules.scope, schema.pricingRules.targetId], set: { multiplier: String(multiplier), updatedAt: sql`now()`, updatedBy: viewer.id } });
    }
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "pricing_rule", entityId: d.id, action: multiplier === null ? "delete" : oldRule ? "update" : "create", before: oldRule ?? null, after: multiplier === null ? null : { scope: "supplier", targetId: d.id, multiplier } });
    return true;
  });

  if (repriced) await refreshCatalog();
  else {
    updateTag("settings");
    updateTag("catalog");
    revalidatePath("/", "layout");
  }
  return { ok: true, message: repriced ? "נשמר והמחירים בקטלוג עודכנו" : "נשמר" };
}

const LABELS: Record<string, string> = {
  name: "שם",
  baseUrl: "כתובת",
  logoUrl: "כתובת הלוגו",
  programs: "תוכניות",
  leadMin: "זמן אספקה",
  leadMax: "זמן אספקה",
  multiplier: "מקדם (1 עד 5)",
  freeShippingUsd: "משלוח חינם",
  notes: "הערות",
  accentColor: "צבע הדגשה",
};

/** "הסתרה" / "הצגה": a hidden supplier and all its parts leave the catalog; orders keep their lines. */
export async function setSupplierActive(id: string, active: boolean): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "ספק לא תקין" };
  const [row] = await db.update(schema.suppliers).set({ active }).where(eq(schema.suppliers.id, id)).returning({ name: schema.suppliers.name });
  if (!row) return { ok: false, error: "הספק לא נמצא" };
  await db.insert(schema.auditLog).values({ actorId: viewer.id, entity: "supplier", entityId: id, action: active ? "show" : "hide", before: { active: !active }, after: { active } });
  await refreshCatalog();
  revalidatePath(PATH);
  return { ok: true, message: active ? `${row.name} מוצג שוב בקטלוג` : `${row.name} והחלקים שלו הוסתרו` };
}

/** "מחיקה": only when no order line or supplier order points at its parts; otherwise the card offers hiding. */
export async function deleteSupplier(id: string): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "ספק לא תקין" };
  const refs = await supplierReferences(id);
  if (refs.removal !== "delete") return { ok: false, error: "יש הזמנות עם חלקים של הספק הזה, אז אפשר רק להסתיר אותו" };
  const name = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.suppliers).where(eq(schema.suppliers.id, id)).for("update");
    if (!before) return null;
    // Checked again inside the lock, so an order sent a moment ago still wins.
    const {
      rows: [again],
    } = await tx.execute<{ n: number }>(sql`
      SELECT (SELECT count(*)::int FROM team_order_items i JOIN variants v ON v.id = i.variant_id WHERE v.supplier_id = ${id})
           + (SELECT count(*)::int FROM supplier_pos WHERE supplier_id = ${id})
           + (SELECT count(*)::int FROM po_lines l JOIN variants v ON v.id = l.variant_id WHERE v.supplier_id = ${id}) AS n`);
    if (again.n > 0) return null;
    // Variants, their cart lines, specs, price history and overrides go with the products (ON DELETE CASCADE).
    await tx.delete(schema.variants).where(eq(schema.variants.supplierId, id));
    await tx.delete(schema.products).where(eq(schema.products.supplierId, id));
    await tx.delete(schema.syncJobs).where(eq(schema.syncJobs.supplierId, id));
    await tx.delete(schema.pricingRules).where(and(eq(schema.pricingRules.scope, "supplier"), inArray(schema.pricingRules.targetId, [id])));
    await tx.delete(schema.suppliers).where(eq(schema.suppliers.id, id));
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "supplier", entityId: id, action: "delete", before, after: null });
    return before.name;
  });
  if (!name) return { ok: false, error: "לא נמחק: יש הזמנות עם חלקים של הספק הזה" };
  await refreshCatalog();
  revalidatePath(PATH);
  return { ok: true, message: `${name} נמחק` };
}

/** "סנכרון עכשיו": runs the GitHub sync for this supplier. The card then follows syncStatus(). */
export async function syncSupplierNow(id: string): Promise<SettingsResult & { since?: string }> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "ספק לא תקין" };
  const [s] = await db.select({ code: schema.suppliers.code, platform: schema.suppliers.platform, active: schema.suppliers.active }).from(schema.suppliers).where(eq(schema.suppliers.id, id));
  if (!s) return { ok: false, error: "הספק לא נמצא" };
  if (s.platform !== "shopify") return { ok: false, error: "ספק ידני לא מסתנכרן" };
  if (!s.active) return { ok: false, error: "הספק מוסתר. הציגו אותו קודם." };
  const since = new Date().toISOString();
  const r = await dispatchSync(s.code);
  return r.ok ? { ok: true, message: "הסנכרון התחיל. זה לוקח כמה דקות.", since } : r;
}

/** The latest sync job, for the card's live status. */
export async function syncStatus(id: string): Promise<SyncJobView | null> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return null;
  return latestSyncJob(id);
}
