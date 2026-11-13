import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Suspense } from "react";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db, schema } from "@/db";
import { suspiciousMultiSupplier, type Suspicion } from "@/domain/catalog-overrides";
import { formatIls, priceIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { familyHref } from "@/lib/catalog-links";
import { priceContext } from "@/lib/settings";
import { saveProductOverride, saveVariantPrice } from "./actions";
import { OverrideForm, RemoveOverrideButton } from "./catalog-forms";

export const metadata: Metadata = { title: "קטלוג: תיקונים" };
/** A save regroups the whole catalog (about 10 s locally). */
export const maxDuration = 60;

const { categories } = schema;

const SUSPICION_LABELS: Record<Suspicion, string> = {
  names: "שמות שונים",
  prices: "מחיר שונה לאותו מק״ט",
  categories: "קטגוריות שונות",
};

const input = "min-h-11 rounded-xl border border-line bg-surface px-3 text-sm";

async function search(q: string) {
  const like = `%${q.toLowerCase()}%`;
  const { rows } = await db.execute<{ slug: string; title: string; supplier_codes: string[]; variant_count: number }>(sql`
    SELECT slug, title, supplier_codes, variant_count FROM product_families
     WHERE missing_since IS NULL AND (lower(title) LIKE ${like} OR search_text LIKE ${like})
     ORDER BY (lower(title) LIKE ${like}) DESC, variant_count DESC LIMIT 20`);
  return rows;
}

async function Results({ q }: { q: string }) {
  const rows = await search(q);
  if (rows.length === 0) return <p className="text-sm text-muted">לא נמצאה משפחה.</p>;
  return (
    <ul className="divide-y divide-line card-surface text-sm">
      {rows.map((r) => (
        <li key={r.slug}>
          <Link href={`/admin/catalog?family=${encodeURIComponent(r.slug)}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 p-3 hover:bg-subtle">
            <Ltr>{r.title}</Ltr>
            <span className="text-caption text-muted">
              <Ltr>{r.supplier_codes.join(", ")}</Ltr>, {r.variant_count} מק״טים
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function FamilyEditor({ slug }: { slug: string }) {
  const [family] = await db.select().from(schema.productFamilies).where(eq(schema.productFamilies.slug, slug));
  if (!family) return <p className="text-sm text-muted">המשפחה לא נמצאה (אולי השתנה הקישור אחרי קיבוץ מחדש).</p>;

  const [{ rows: products }, { rows: variants }, cats, rate] = await Promise.all([
    db.execute<{
      id: string; title: string; supplier: string; images: string[]; url: string; category_id: string | null;
      o_hidden: boolean | null; o_images: string[] | null; o_category: string | null; o_alone: boolean | null; o_merge: string | null; o_pin: number | null; o_note: string | null;
    }>(sql`
      SELECT p.id, p.title, s.name AS supplier, p.images, p.url, p.category_id,
             o.hidden AS o_hidden, o.images AS o_images, o.category_id AS o_category, o.alone AS o_alone,
             o.merge_key AS o_merge, o.pin_rank AS o_pin, o.note AS o_note
        FROM products p JOIN suppliers s ON s.id = p.supplier_id
        LEFT JOIN product_overrides o ON o.product_id = p.id
       WHERE p.id IN (SELECT product_id FROM variants WHERE family_id = ${family.id})
       ORDER BY p.id = ${family.primaryProductId} DESC, s.name`),
    db.execute<{ id: string; sku: string | null; product_id: string; options: Record<string, string>; supplier_price_usd: string | null; markup: string | null; o_price: string | null }>(sql`
      SELECT v.id, v.supplier_sku AS sku, v.product_id, v.family_options AS options, v.supplier_price_usd, v.markup, o.price_usd AS o_price
        FROM variants v LEFT JOIN variant_overrides o ON o.variant_id = v.id
       WHERE v.family_id = ${family.id} AND v.missing_since IS NULL
       ORDER BY v.supplier_sku NULLS LAST`),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
    priceContext(),
  ]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section font-semibold">
          <Ltr>{family.title}</Ltr>
        </h2>
        <Link href={familyHref(family.slug)} className="text-sm text-brand hover:underline">
          לדף המוצר
        </Link>
      </div>

      {products.map((p) => (
        <div key={p.id} className="card-surface flex flex-col gap-4 rounded-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <a href={p.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand">
              <Ltr>{p.title}</Ltr>
            </a>
            <Ltr className="text-caption text-muted">{p.supplier}</Ltr>
          </div>
          <OverrideForm action={saveProductOverride} className="flex flex-col gap-4">
            <input type="hidden" name="productId" value={p.id} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">תמונה ראשית</legend>
              <div className="flex flex-wrap gap-2">
                {(p.o_images ?? p.images).slice(0, 8).map((src, i) => (
                  <button key={src} type="submit" name="main" value={src} aria-label={i === 0 ? "התמונה הראשית" : "קביעה כתמונה ראשית"} className={`tile-fade size-16 overflow-hidden rounded-xl border-2 ${i === 0 ? "border-brand" : "border-line hover:border-brand-soft"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- supplier thumbnails, admin only */}
                    <img src={src} alt="" className="size-full object-contain" />
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">תמונות במקום של הספק (קישור https בכל שורה, ריק = של הספק)</span>
                <textarea name="images" rows={2} defaultValue={(p.o_images ?? []).join("\n")} dir="ltr" className={`${input} py-2`} />
              </label>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">קטגוריה</span>
                <select name="categoryId" defaultValue={p.o_category ?? ""} className={input}>
                  <option value="">כמו אצל הספק ({cats.find((c) => c.id === p.category_id)?.name ?? "ללא"})</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">מיקום ב״מומלץ״ (1 ראשון, ריק = לא מוצמד)</span>
                <input name="pinRank" type="number" min={1} max={999} inputMode="numeric" defaultValue={p.o_pin ?? ""} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">איחוד עם משפחה (קישור, slug או מק״ט)</span>
                <input name="mergeWith" defaultValue={p.o_merge ?? ""} dir="ltr" className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">הערה</span>
                <input name="note" defaultValue={p.o_note ?? ""} className={input} />
              </label>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="alone" defaultChecked={p.o_alone ?? false} className="size-5" />
                הפרדה למשפחה נפרדת
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="hidden" defaultChecked={p.o_hidden ?? false} className="size-5" />
                הסתרה מהקטלוג
              </label>
            </div>
          </OverrideForm>

          <ul className="divide-y divide-line text-sm">
            {variants
              .filter((v) => v.product_id === p.id)
              .map((v) => {
                const ils = priceIls(v.o_price ?? v.supplier_price_usd, rate, v.markup);
                return (
                  <li key={v.id} className="py-2">
                    <OverrideForm action={saveVariantPrice} label="שמירת מחיר" className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="variantId" value={v.id} />
                      <span className="min-w-32">
                        <Ltr className="font-mono">{v.sku ?? "ללא מק״ט"}</Ltr>
                        {Object.values(v.options).length > 0 && (
                          <span className="ms-2 text-muted">
                            <Ltr>{Object.values(v.options).join(", ")}</Ltr>
                          </span>
                        )}
                      </span>
                      <span className="text-muted">
                        אצל הספק <Ltr>{v.supplier_price_usd ? `$${v.supplier_price_usd}` : "אין מחיר"}</Ltr>
                      </span>
                      <label className="flex items-center gap-2">
                        <span className="text-muted">מחיר שלנו $</span>
                        <input name="priceUsd" inputMode="decimal" defaultValue={v.o_price ?? ""} dir="ltr" className={`${input} w-24`} aria-label="מחיר בדולרים במקום של הספק" />
                      </label>
                      <span className="tabular-nums">{ils === null ? "ללא מחיר" : formatIls(ils)}</span>
                    </OverrideForm>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}

async function ActiveOverrides() {
  const { rows } = await db.execute<{ kind: "product" | "variant"; id: string; title: string; supplier: string; sku: string | null; detail: string; slug: string | null }>(sql`
    SELECT 'product' AS kind, o.product_id AS id, p.title, s.name AS supplier, NULL AS sku,
           concat_ws(', ',
             CASE WHEN o.hidden THEN 'מוסתר' END,
             CASE WHEN o.alone THEN 'משפחה נפרדת' END,
             CASE WHEN o.merge_key IS NOT NULL THEN 'מאוחד: ' || o.merge_key END,
             CASE WHEN o.images IS NOT NULL THEN 'תמונות' END,
             CASE WHEN o.category_id IS NOT NULL THEN 'קטגוריה: ' || c.name END,
             CASE WHEN o.pin_rank IS NOT NULL THEN 'מומלץ ' || o.pin_rank END,
             o.note) AS detail,
           (SELECT f.slug FROM variants v JOIN product_families f ON f.id = v.family_id WHERE v.product_id = p.id LIMIT 1) AS slug,
           o.updated_at
      FROM product_overrides o JOIN products p ON p.id = o.product_id JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN categories c ON c.id = o.category_id
    UNION ALL
    SELECT 'variant', o.variant_id, p.title, s.name, v.supplier_sku,
           '$' || o.price_usd || ' במקום ' || coalesce('$' || v.supplier_price_usd, 'אין מחיר'),
           f.slug, o.updated_at
      FROM variant_overrides o JOIN variants v ON v.id = o.variant_id JOIN products p ON p.id = v.product_id
      JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN product_families f ON f.id = v.family_id
     ORDER BY updated_at DESC`);
  if (rows.length === 0) return <p className="text-sm text-muted">אין עדיין תיקונים. חפשו משפחה כדי להתחיל.</p>;
  return (
    <ul className="divide-y divide-line card-surface text-sm">
      {rows.map((r) => (
        <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex min-w-0 flex-col">
            {r.slug ? (
              <Link href={`/admin/catalog?family=${encodeURIComponent(r.slug)}`} className="hover:text-brand">
                <Ltr>{r.title}</Ltr>
              </Link>
            ) : (
              <Ltr>{r.title}</Ltr>
            )}
            <span className="text-caption text-muted">
              <Ltr>{[r.supplier, r.sku].filter(Boolean).join(", ")}</Ltr>, {r.detail}
            </span>
          </div>
          <RemoveOverrideButton kind={r.kind} id={r.id} />
        </li>
      ))}
    </ul>
  );
}

async function MultiSupplier() {
  const [{ rows: members }, { rows: prices }] = await Promise.all([
    db.execute<{ family_id: string; slug: string; family_title: string; supplier_code: string; title: string; category: string | null }>(sql`
      SELECT DISTINCT f.id AS family_id, f.slug, f.title AS family_title, s.code AS supplier_code, p.title, c.slug AS category
        FROM product_families f JOIN variants v ON v.family_id = f.id JOIN products p ON p.id = v.product_id
        JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE f.missing_since IS NULL AND cardinality(f.supplier_codes) > 1`),
    db.execute<{ family_id: string; sku: string | null; supplier_code: string; price_usd: string | null }>(sql`
      SELECT v.family_id, v.supplier_sku AS sku, s.code AS supplier_code, v.supplier_price_usd AS price_usd
        FROM variants v JOIN suppliers s ON s.id = v.supplier_id JOIN product_families f ON f.id = v.family_id
       WHERE f.missing_since IS NULL AND cardinality(f.supplier_codes) > 1 AND v.missing_since IS NULL`),
  ]);
  const families = new Map<string, { slug: string; title: string; members: { supplierCode: string; title: string; categorySlug: string | null }[]; prices: { sku: string | null; supplierCode: string; priceUsd: string | null }[] }>();
  for (const m of members) {
    const f = families.get(m.family_id) ?? { slug: m.slug, title: m.family_title, members: [], prices: [] };
    f.members.push({ supplierCode: m.supplier_code, title: m.title, categorySlug: m.category });
    families.set(m.family_id, f);
  }
  for (const p of prices) families.get(p.family_id)?.prices.push({ sku: p.sku, supplierCode: p.supplier_code, priceUsd: p.price_usd });
  const flagged = [...families.values()]
    .map((f) => ({ ...f, why: suspiciousMultiSupplier(f.members, f.prices) }))
    .filter((f) => f.why.length > 0)
    .sort((a, b) => b.why.length - a.why.length || a.title.localeCompare(b.title));

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-section font-semibold">משפחות של כמה ספקים לבדיקה ({flagged.length.toLocaleString("he-IL")} מתוך {families.size.toLocaleString("he-IL")})</h2>
        <p className="text-sm text-muted">משפחות שהמוצרים בהן לא חולקים שם, שאותו מק״ט עולה בהן סכום שונה מאוד, או שהספקים מתייקים אחרת. אם זה לא אותו חלק: פתחו ובחרו ״הפרדה למשפחה נפרדת״.</p>
      </div>
      {flagged.length > 0 && (
        <ul className="divide-y divide-line card-surface text-sm">
          {flagged.map((f) => (
            <li key={f.slug}>
              <Link href={`/admin/catalog?family=${encodeURIComponent(f.slug)}`} className="flex min-h-11 flex-col gap-1 p-3 hover:bg-subtle">
                <Ltr className="font-medium">{f.title}</Ltr>
                <span className="text-caption text-muted">
                  {f.why.map((w) => SUSPICION_LABELS[w]).join(", ")}:{" "}
                  <Ltr>{[...new Set(f.members.map((m) => `${m.supplierCode}: ${m.title}`))].join(" | ")}</Ltr>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin/catalog">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const family = typeof params.family === "string" ? params.family : "";
  return (
    <div className="flex flex-col gap-8">
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="שם משפחה או מק״ט" aria-label="חיפוש משפחה" className={`${input} min-w-0 flex-1`} />
        <button type="submit" className="btn-brand min-h-11 rounded-full px-5 text-sm font-medium">
          חיפוש
        </button>
      </form>
      {q && <Results q={q} />}
      {family && <FamilyEditor slug={family} />}
      <section className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">תיקונים פעילים</h2>
        <ActiveOverrides />
      </section>
      <MultiSupplier />
      <p className="text-callout text-muted">
        שמות, סדר, קבוצות ותמונות של קטגוריות:{" "}
        <Link href="/admin/settings/categories" className="text-brand hover:underline">
          הגדרות, קטגוריות
        </Link>
        .
      </p>
    </div>
  );
}

export default function CatalogAdminPage({ searchParams }: PageProps<"/admin/catalog">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-semibold">קטלוג: תיקונים</h1>
        <p className="text-sm text-muted">
          הסתרה, מחיר, תמונה, קטגוריה, הפרדה ואיחוד של משפחות, ומוצרים מומלצים. התיקונים נשמרים בנפרד מהסנכרון הלילי, ולכן נשארים גם אחריו.{" "}
          <Link href="/admin/catalog/grouping" className="text-brand hover:underline">
            דוח הקיבוץ
          </Link>
        </p>
      </div>
      <Suspense
        fallback={
          <Loading>
            <PageSkeleton />
          </Loading>
        }
      >
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
