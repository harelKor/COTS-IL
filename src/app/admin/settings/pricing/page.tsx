import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";
import { Suspense } from "react";
import { Card, Field, fieldClass, Input, Select } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db, schema } from "@/db";
import { formatMarkup, type SupplierDiscount } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { getPricingRules, getSettings, priceContext } from "@/lib/settings";
import { saveDiscount, saveRule } from "../actions";
import { SettingsForm } from "../settings-form";
import { PricingForm, RemoveRuleButton, type Rule, type Sample } from "./pricing-forms";

export const metadata: Metadata = { title: "הגדרות: תמחור" };
/** A save regroups the whole catalog (about 10 s locally). */
export const maxDuration = 60;

/** Five priced parts for the preview: one per supplier first, then the next. */
async function samples(): Promise<Sample[]> {
  const { rows } = await db.execute<{ id: string; title: string; supplier_name: string; supplier_id: string; category_id: string | null; price_usd: string; markup: string | null }>(sql`
    SELECT id, title, supplier_name, supplier_id, category_id, price_usd, markup FROM (
      SELECT v.id, f.title, s.name AS supplier_name, v.supplier_id, coalesce(o.category_id, p.category_id) AS category_id, v.price_usd, v.markup,
             row_number() OVER (PARTITION BY v.supplier_id ORDER BY f.pinned_rank NULLS LAST, f.variant_count DESC, v.id) AS n
        FROM variants v
        JOIN products p ON p.id = v.product_id
        JOIN suppliers s ON s.id = v.supplier_id
        JOIN product_families f ON f.id = v.family_id
        LEFT JOIN product_overrides o ON o.product_id = p.id
       WHERE v.price_usd > 0 AND v.missing_since IS NULL AND p.status = 'published' AND s.active
    ) t WHERE n <= 2 ORDER BY n, supplier_name LIMIT 5`);
  return rows.map((r) => ({ id: r.id, title: r.title, supplierName: r.supplier_name, supplierId: r.supplier_id, categoryId: r.category_id, priceUsd: r.price_usd, markup: r.markup }));
}

async function Pricing() {
  await requireAdmin();
  const [ctx, settings, ruleRows, suppliers, categories, sampleRows, discounted] = await Promise.all([
    priceContext(),
    getSettings(),
    getPricingRules(),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name, code: schema.suppliers.code }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
    db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
    samples(),
    discountCounts(),
  ]);
  const names = new Map([...suppliers, ...categories].map((x) => [x.id, x.name]));
  const rules: Rule[] = ruleRows.map((r) => ({ ...r, name: names.get(r.targetId) ?? "לא קיים עוד" }));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <PricingForm
          current={ctx}
          boiRate={ctx.boiRate}
          rateDate={ctx.rateDate}
          manualRate={settings.pricing.rateOverride?.rate ?? null}
          vatRate={settings.pricing.vatRate}
          rules={rules}
          samples={sampleRows}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">מקדם לספק או לקטגוריה</h2>
          <p className="text-caption text-muted">
            קודם מחיר קבוע של חלק, אחר כך מקדם הקטגוריה, אחר כך מקדם הספק, ובסוף המקדם הכללי. שמירה מעדכנת את המחירים בקטלוג.
          </p>
        </div>
        {rules.length > 0 ? (
          <ul className="divide-y divide-line">
            {(["category", "supplier"] as const).flatMap((scope) =>
              rules
                .filter((r) => r.scope === scope)
                .map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-callout">
                    <span>
                      {scope === "category" ? "קטגוריה" : "ספק"}: <Ltr className="font-medium">{r.name}</Ltr>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">
                        × <Ltr>{formatMarkup(r.multiplier)}</Ltr>
                      </span>
                      <RemoveRuleButton id={r.id} name={r.name} />
                    </span>
                  </li>
                )),
            )}
          </ul>
        ) : (
          <p className="text-callout text-muted">אין עדיין. כל החלקים במקדם הכללי.</p>
        )}
        <SettingsForm action={saveRule} label="הוספה או עדכון" pendingLabel="מעדכן את המחירים…" primary={false} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Field label="ספק או קטגוריה" name="target">
              <Select name="target" required defaultValue="">
                <option value="" disabled>
                  בחרו
                </option>
                <optgroup label="קטגוריות">
                  {categories.map((c) => (
                    <option key={c.id} value={`category:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="ספקים">
                  {suppliers.map((s) => (
                    <option key={s.id} value={`supplier:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>
            <Field label="מקדם" name="multiplier">
              <Input name="multiplier" type="number" min={1} max={5} step={0.01} inputMode="decimal" dir="ltr" required placeholder={formatMarkup(settings.pricing.markup)} />
            </Field>
          </div>
        </SettingsForm>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">הנחות ספקים</h2>
          <p className="text-caption text-muted">
            הנחה שהספק נותן לנו בקנייה (goBILDA: ‏25% לקבוצות FIRST). היא יורדת ממחיר הדולר לפני המקדם, והמחיר באתר מוצג אחריה, עם המחיר הקודם מחוק והתווית. goBILDA לא מפרסמת רשימת החרגות, אז כדאי לבדוק בעגלה שלה בהזמנה הראשונה. חלק עם מחיר דולר ידני או חלק שהוספתם בעצמכם לא מקבל הנחה.
          </p>
        </div>
        {settings.pricing.discounts.map((d) => (
          <div key={d.supplier} className="border-t border-line pt-4 first:border-t-0 first:pt-0">
            <DiscountForm rule={d} suppliers={suppliers} counts={discounted.get(d.supplier)} />
          </div>
        ))}
        {suppliers.some((s) => !settings.pricing.discounts.some((d) => d.supplier === s.code)) && (
          <details className="border-t border-line pt-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-callout font-medium text-brand">הנחה לספק נוסף</summary>
            <div className="pt-3">
              <DiscountForm rule={null} suppliers={suppliers.filter((s) => !settings.pricing.discounts.some((d) => d.supplier === s.code))} />
            </div>
          </details>
        )}
      </Card>
    </div>
  );
}

/** How many of each supplier's parts have its discount now, and how many it leaves out. */
async function discountCounts(): Promise<Map<string, { on: number; off: number }>> {
  const { rows } = await db.execute<{ code: string; on: number; off: number }>(sql`
    SELECT s.code, (count(*) FILTER (WHERE v.discount IS NOT NULL))::int AS on, (count(*) FILTER (WHERE v.discount IS NULL))::int AS off
      FROM variants v JOIN suppliers s ON s.id = v.supplier_id
     WHERE v.missing_since IS NULL
     GROUP BY s.code`);
  return new Map(rows.map((r) => [r.code, { on: r.on, off: r.off }]));
}

function DiscountForm({ rule, suppliers, counts }: { rule: SupplierDiscount | null; suppliers: { code: string; name: string }[]; counts?: { on: number; off: number } }) {
  const id = rule ? `discount-${rule.supplier}` : "discount-new";
  return (
    <SettingsForm action={saveDiscount} label={rule ? "שמירה" : "הוספה"} pendingLabel="מעדכן את המחירים…" primary={false} className="flex flex-col gap-3">
      {rule ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body font-semibold">
            <Ltr>{suppliers.find((s) => s.code === rule.supplier)?.name ?? rule.supplier}</Ltr>
          </h3>
          {counts && (
            <span className="text-caption text-muted">
              {rule.enabled ? `${counts.on.toLocaleString("he-IL")} חלקים בהנחה, ${counts.off.toLocaleString("he-IL")} בלי` : "כבויה"}
            </span>
          )}
          <input type="hidden" name="supplier" value={rule.supplier} />
        </div>
      ) : (
        <Field label="ספק" name={`${id}-supplier`}>
          <Select id={`${id}-supplier`} name="supplier" required defaultValue="">
            <option value="" disabled>
              בחרו
            </option>
            {suppliers.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Field label="הנחה (%)" name={`${id}-percent`}>
          <Input id={`${id}-percent`} name="percent" type="number" min={1} max={90} step={0.5} inputMode="decimal" dir="ltr" required defaultValue={rule?.percent ?? ""} />
        </Field>
        <Field label="תווית ליד המחיר" name={`${id}-label`}>
          <Input id={`${id}-label`} name="label" required maxLength={30} defaultValue={rule?.label ?? "הנחת FTC"} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="תת-קטגוריות של הספק שלא בהנחה (שורה לכל אחת)" name={`${id}-types`} hint="כפי שהספק קורא להן, למשל MERCH">
          <textarea id={`${id}-types`} name="excludeTypes" dir="ltr" rows={3} defaultValue={rule?.excludeTypes.join("\n") ?? ""} className={`${fieldClass} h-auto py-2 font-mono`} />
        </Field>
        <Field label="מק״טים שלא בהנחה (שורה לכל אחד)" name={`${id}-skus`}>
          <textarea id={`${id}-skus`} name="excludeSkus" dir="ltr" rows={3} defaultValue={rule?.excludeSkus.join("\n") ?? ""} className={`${fieldClass} h-auto py-2 font-mono`} />
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true} className="size-5 accent-brand" />
        <span className="text-callout">פעילה</span>
      </label>
    </SettingsForm>
  );
}

export default function PricingSettingsPage() {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <Pricing />
    </Suspense>
  );
}
