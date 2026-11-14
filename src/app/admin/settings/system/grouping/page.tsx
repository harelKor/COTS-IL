import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { Suspense } from "react";
import { productHref } from "@/components/catalog";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db } from "@/db";
import { suspiciousMultiSupplier, type Suspicion } from "@/domain/catalog-overrides";
import { requireAdmin } from "@/lib/auth";
import { getGroupingReport } from "@/lib/catalog";

export const metadata: Metadata = { title: "הגדרות: דוח קיבוץ" };

const GROUPING_LABELS: Record<string, string> = {
  title: "קובצו לפי שם (מידות כאפשרויות)",
  supplier: "מוצר עם אפשרויות אצל הספק",
  single: "מוצר בודד",
};

const REASON_LABELS: Record<string, { title: string; help: string }> = {
  "reference-page": {
    title: "דפי אוסף של הספק",
    help: "דפים בלי מק״ט עם \"This Page is for Reference Only\". הוסתרו מהקטלוג, והקישורים אליהם מפנים לקטגוריה.",
  },
  "duplicate-options": {
    title: "מוצרים עם אותן מידות",
    help: "שני מוצרים של אותו ספק יצאו עם אותן אפשרויות, אז הם נשארו נפרדים במקום לנחש.",
  },
  "no-size": {
    title: "לא זוהתה מידה בשם",
    help: "מוצרים בקטגוריה של חלקים במידות, שהשם שלהם לא נקרא. הם מוצגים כמוצר בודד.",
  },
  "name-only": {
    title: "אותו שם אצל ספקים שונים, בלי אישור",
    help: "מוצרים של שני ספקים עם אותו שם, בלי מק״ט משותף, מחיר דומה או שם היצרן בכותרת. הם נשארו נפרדים. אם זה אותו חלק: פתחו את החלק ואחדו אותו בחלק ״משפחה״.",
  },
};

const SUSPICION_LABELS: Record<Suspicion, string> = {
  names: "שמות שונים",
  prices: "מחיר שונה לאותו מק״ט",
  categories: "קטגוריות שונות",
};

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
        <p className="text-sm text-muted">משפחות שהמוצרים בהן לא חולקים שם, שאותו מק״ט עולה בהן סכום שונה מאוד, או שהספקים מתייקים אחרת. אם זה לא אותו חלק: פתחו את החלק ובחרו ״הפרדה למשפחה נפרדת״ בחלק ״משפחה״.</p>
      </div>
      {flagged.length > 0 && (
        <ul className="divide-y divide-line card-surface text-sm">
          {flagged.map((f) => (
            <li key={f.slug}>
              <Link href={`/admin/settings/products?family=${encodeURIComponent(f.slug)}`} className="flex min-h-11 flex-col gap-1 p-3 hover:bg-subtle">
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

async function Report() {
  await requireAdmin();
  const { bySupplier, byGrouping, multiSupplier, issues } = await getGroupingReport();
  const reasons = Object.keys(REASON_LABELS).filter((r) => issues.some((i) => i.reason === r));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">מק״טים למשפחות, לפי ספק</h2>
        <div className="overflow-x-auto card-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-muted">
              <tr>
                <th className="p-3 text-start font-medium">ספק</th>
                <th className="p-3 text-start font-medium">מק״טים</th>
                <th className="p-3 text-start font-medium">משפחות</th>
                <th className="p-3 text-start font-medium">ממוצע מק״טים למשפחה</th>
              </tr>
            </thead>
            <tbody>
              {bySupplier.map((s) => (
                <tr key={s.code} className="border-t border-line">
                  <td className="p-3">
                    <Ltr>{s.name}</Ltr>
                  </td>
                  <td className="p-3 tabular-nums">{s.variants.toLocaleString("he-IL")}</td>
                  <td className="p-3 tabular-nums">{s.families.toLocaleString("he-IL")}</td>
                  <td className="p-3 tabular-nums">{(s.variants / Math.max(s.families, 1)).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {byGrouping.map((g) => (
            <li key={g.grouping}>
              {GROUPING_LABELS[g.grouping]}: <span className="tabular-nums">{g.count.toLocaleString("he-IL")}</span>
            </li>
          ))}
          <li>
            משפחות שנמכרות אצל יותר מספק אחד: <span className="tabular-nums">{multiSupplier.toLocaleString("he-IL")}</span>
          </li>
        </ul>
      </section>

      <MultiSupplier />

      {reasons.length === 0 && <p className="text-muted">אין מוצרים שממתינים לבדיקה.</p>}
      {reasons.map((reason) => {
        const rows = issues.filter((i) => i.reason === reason);
        return (
          <section key={reason} className="flex flex-col gap-3">
            <div>
              <h2 className="text-section font-semibold">
                {REASON_LABELS[reason].title} ({rows.length.toLocaleString("he-IL")})
              </h2>
              <p className="text-sm text-muted">{REASON_LABELS[reason].help}</p>
            </div>
            <ul className="divide-y divide-line card-surface text-sm">
              {rows.map((row) => (
                <li key={`${row.supplierCode}/${row.handle}`} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                  <Link href={productHref(row.supplierCode, row.handle)} className="hover:text-brand">
                    <Ltr>{row.detail}</Ltr>
                  </Link>
                  <Ltr className="text-caption text-muted">{row.supplierName}</Ltr>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default function GroupingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-section font-semibold">דוח קיבוץ: מוצרים למשפחות</h2>
        <p className="text-sm text-muted">
          המשפחות נבנות מחדש בכל סנכרון. מוצרים שלא קובצו בביטחון נשארים כאן לבדיקה במקום ניחוש. מאחדים ומפרידים בחלון העריכה של החלק, בדף{" "}
          <Link href="/admin/settings/products" className="text-brand hover:underline">
            מוצרים
          </Link>
          .
        </p>
      </div>
      <Suspense
        fallback={
          <Loading>
            <PageSkeleton />
          </Loading>
        }
      >
        <Report />
      </Suspense>
    </div>
  );
}
