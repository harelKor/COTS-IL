import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";
import { Suspense } from "react";
import { Card, Field, Input, Select } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db, schema } from "@/db";
import { formatMarkup } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { getPricingRules, getSettings, priceContext } from "@/lib/settings";
import { saveRule } from "../actions";
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
  const [ctx, settings, ruleRows, suppliers, categories, sampleRows] = await Promise.all([
    priceContext(),
    getSettings(),
    getPricingRules(),
    db.select({ id: schema.suppliers.id, name: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
    db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
    samples(),
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
    </div>
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
