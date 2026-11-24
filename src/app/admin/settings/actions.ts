"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { businessFromForm, pricingSettingsSchema, ROUND_STEPS, supplierDiscountSchema } from "@/domain/settings";
import { requireAdmin } from "@/lib/auth";
import { regroupNow } from "@/lib/regroup";
import { currentSettings, writeSettings } from "@/lib/settings-write";

/**
 * The admin's settings (S16a). Every save checks the admin first, writes audit_log, and
 * expires the `settings` cache so the next page shows it; pricing saves also regroup
 * the catalog (about 10 s) so every price uses the new multiplier. Orders and quotes
 * keep the prices they were saved with.
 */

export type SettingsResult = { ok: true; message?: string } | { ok: false; error: string; fields?: string[] };

const FIELD_LABELS: Record<string, string> = {
  quoteLeadBusinessDays: "ימים עד הצעת מחיר",
  legalName: "שם העסק",
  companyNumber: "ח.פ.",
  email: "דוא״ל",
  phone: "טלפון",
  whatsapp: "וואטסאפ",
  pickupAddress: "כתובת איסוף",
  pickupHours: "שעות איסוף",
  handlingFee: "דמי טיפול",
  priceIncludes: "מה כלול במחיר",
  leadTimes: "זמני אספקה",
  returnPolicy: "מדיניות החזרות",
  quoteValidDays: "תוקף הצעה",
  paymentTerms: "תנאי תשלום",
};

/** Saves פרטי העסק. An empty field stays hidden on the site. */
export async function saveBusiness(_: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const codes = (await db.select({ code: schema.suppliers.code }).from(schema.suppliers)).map((s) => s.code);
  const parsed = businessFromForm(formData, codes);
  if (!parsed.ok) return { ok: false, error: `לא תקין: ${parsed.fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}`, fields: parsed.fields };
  const before = await currentSettings();
  const business = { ...parsed.value, pendingTeamsMaySend: formData.get("pendingTeamsMaySend") === "on" };
  await writeSettings(viewer.id, "update_business", before, { ...before, business });
  revalidatePath("/", "layout");
  return { ok: true, message: "פרטי העסק נשמרו" };
}

const pricingInput = z.object({
  markup: z.coerce.number().min(1).max(5),
  roundTo: z.coerce.number().pipe(z.union(ROUND_STEPS.map((n) => z.literal(n)))),
  minIls: z.union([z.literal(""), z.coerce.number().int().min(1).max(10000)]),
  rate: z.union([z.literal(""), z.coerce.number().min(1).max(10)]),
  /** Percent, e.g. 18. */
  vat: z.coerce.number().min(0).max(50),
});

async function repriceCatalog() {
  await regroupNow();
  updateTag("settings");
  updateTag("catalog");
  revalidatePath("/", "layout");
}

/** Saves the global multiplier, the manual rate, rounding and the minimum, then reprices the catalog. */
export async function savePricing(_: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const parsed = pricingInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "בדקו את המקדם (1 עד 5), השער (1 עד 10), המע״מ (0 עד 50%) והמחיר המינימלי" };
  const before = await currentSettings();
  const { markup, roundTo, minIls, rate, vat } = parsed.data;
  const pricing = pricingSettingsSchema.parse({
    markup,
    vatRate: Math.round(vat * 100) / 10000,
    roundTo,
    minIls: minIls === "" ? null : minIls,
    rateOverride: rate === "" ? null : before.pricing.rateOverride?.rate === rate ? before.pricing.rateOverride : { rate, setAt: new Date().toISOString() },
    // Kept: the suppliers' discounts have their own form (saveDiscount).
    discounts: before.pricing.discounts,
  });
  await writeSettings(viewer.id, "update_pricing", before, { ...before, pricing });
  await repriceCatalog();
  return { ok: true, message: "התמחור נשמר והמחירים בקטלוג עודכנו" };
}

/** "ניקוי": back to the Bank of Israel rate. */
export async function clearRateOverride(): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const before = await currentSettings();
  if (!before.pricing.rateOverride) return { ok: true };
  await writeSettings(viewer.id, "clear_rate_override", before, { ...before, pricing: { ...before.pricing, rateOverride: null } });
  await repriceCatalog();
  return { ok: true, message: "חזרה לשער בנק ישראל" };
}

/** One name per line (or comma), blanks dropped, no repeats. */
const lines = (v: FormDataEntryValue | null) => [...new Set(String(v ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];

/** Adds or changes one supplier's discount (pricing.discounts), then reprices the catalog. */
export async function saveDiscount(_: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const codes = (await db.select({ code: schema.suppliers.code }).from(schema.suppliers)).map((s) => s.code);
  const parsed = supplierDiscountSchema.safeParse({
    supplier: String(formData.get("supplier") ?? ""),
    percent: Number(formData.get("percent")),
    label: String(formData.get("label") ?? ""),
    enabled: formData.get("enabled") === "on",
    excludeTypes: lines(formData.get("excludeTypes")),
    excludeSkus: lines(formData.get("excludeSkus")),
  });
  if (!parsed.success || !codes.includes(parsed.data.supplier)) return { ok: false, error: "בחרו ספק, אחוז בין 1 ל-90 ותווית" };
  const before = await currentSettings();
  const others = before.pricing.discounts.filter((d) => d.supplier !== parsed.data.supplier);
  await writeSettings(viewer.id, "update_discount", before, { ...before, pricing: { ...before.pricing, discounts: [...others, parsed.data] } });
  await repriceCatalog();
  return { ok: true, message: parsed.data.enabled ? "ההנחה נשמרה והמחירים עודכנו" : "ההנחה כבויה והמחירים עודכנו" };
}

const ruleInput = z.object({
  scope: z.enum(["supplier", "category"]),
  targetId: z.uuid(),
  multiplier: z.coerce.number().min(1).max(5),
});

/** Adds or changes the multiplier of one supplier or category. */
export async function saveRule(_: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  // The form's one select sends "category:<id>" or "supplier:<id>".
  const [rawScope, rawTarget] = String(formData.get("target") ?? `${formData.get("scope")}:${formData.get("targetId")}`).split(":");
  const parsed = ruleInput.safeParse({ scope: rawScope, targetId: rawTarget, multiplier: formData.get("multiplier") });
  if (!parsed.success) return { ok: false, error: "בחרו ספק או קטגוריה ומקדם בין 1 ל-5" };
  const { scope, targetId, multiplier } = parsed.data;
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.pricingRules).where(and(eq(schema.pricingRules.scope, scope), eq(schema.pricingRules.targetId, targetId)));
    const [saved] = await tx
      .insert(schema.pricingRules)
      .values({ scope, targetId, multiplier: String(multiplier), updatedBy: viewer.id })
      .onConflictDoUpdate({
        target: [schema.pricingRules.scope, schema.pricingRules.targetId],
        set: { multiplier: String(multiplier), updatedAt: sql`now()`, updatedBy: viewer.id },
      })
      .returning();
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "pricing_rule", entityId: saved.id, action: before ? "update" : "create", before: before ?? null, after: saved });
  });
  await repriceCatalog();
  return { ok: true, message: "המקדם נשמר והמחירים עודכנו" };
}

/** Removes a rule; its parts go back to the next rule down. Returns it, for Undo. */
export async function removeRule(id: string): Promise<{ scope: "supplier" | "category"; targetId: string; multiplier: string } | null> {
  const viewer = await requireAdmin();
  if (!z.uuid().safeParse(id).success) return null;
  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(schema.pricingRules).where(eq(schema.pricingRules.id, id)).returning();
    if (row) await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "pricing_rule", entityId: row.id, action: "delete", before: row, after: null });
    return row;
  });
  if (!removed) return null;
  await repriceCatalog();
  return { scope: removed.scope, targetId: removed.targetId, multiplier: removed.multiplier };
}

/** Undo for removeRule. */
export async function restoreRule(rule: { scope: "supplier" | "category"; targetId: string; multiplier: string }): Promise<SettingsResult> {
  const form = new FormData();
  form.set("scope", rule.scope);
  form.set("targetId", rule.targetId);
  form.set("multiplier", rule.multiplier);
  return saveRule(null, form);
}

/**
 * Grants or revokes the admin, as `npm run admin` does (scripts/admin.ts): the person
 * must have signed in once, and the last admin can't be removed.
 */
async function setAdmin(actorId: string, email: string, makeAdmin: boolean): Promise<SettingsResult> {
  return db.transaction(async (tx) => {
    const {
      rows: [profile],
    } = await tx.execute<{ id: string; is_admin: boolean }>(sql`SELECT id, is_admin FROM profiles WHERE lower(email) = ${email} FOR UPDATE`);
    if (!profile) return { ok: false, error: "אין משתמש עם הכתובת הזאת. צריך להתחבר לאתר פעם אחת קודם." } as const;
    if (profile.is_admin === makeAdmin) return { ok: true, message: makeAdmin ? "כבר מנהל/ת" : "כבר לא מנהל/ת" } as const;
    if (!makeAdmin) {
      // Locks every admin row, so two removals at once can't both pass the check.
      const { rows } = await tx.execute<{ id: string }>(sql`SELECT id FROM profiles WHERE is_admin FOR UPDATE`);
      if (rows.length <= 1) return { ok: false, error: "זה המנהל האחרון. הוסיפו מנהל אחר קודם." } as const;
    }
    await tx.update(schema.profiles).set({ isAdmin: makeAdmin }).where(eq(schema.profiles.id, profile.id));
    await tx.insert(schema.auditLog).values({
      actorId,
      entity: "profile",
      entityId: profile.id,
      action: makeAdmin ? "grant_admin" : "revoke_admin",
      before: { isAdmin: !makeAdmin },
      after: { isAdmin: makeAdmin, by: "/admin/settings/admins" },
    });
    return { ok: true, message: makeAdmin ? `${email} נוסף/ה כמנהל/ת` : `${email} הוסר/ה מהמנהלים` } as const;
  });
}

export async function addAdmin(_: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { ok: false, error: "כתובת דוא״ל לא תקינה", fields: ["email"] };
  const result = await setAdmin(viewer.id, email.data, true);
  revalidatePath("/admin/settings/admins");
  return result;
}

export async function removeAdmin(email: string): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const parsed = z.email().safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { ok: false, error: "כתובת דוא״ל לא תקינה" };
  if (parsed.data === viewer.email.trim().toLowerCase()) return { ok: false, error: "אי אפשר להסיר את עצמכם. מנהל אחר יכול להסיר אתכם." };
  const result = await setAdmin(viewer.id, parsed.data, false);
  revalidatePath("/admin/settings/admins");
  return result;
}
