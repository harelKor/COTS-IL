import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { productHref } from "@/components/catalog";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { requireAdmin } from "@/lib/auth";
import { getGroupingReport } from "@/lib/catalog";

export const metadata: Metadata = { title: "קיבוץ מוצרים למשפחות" };

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
};

async function Report() {
  await requireAdmin();
  const { bySupplier, byGrouping, multiSupplier, issues } = await getGroupingReport();
  const reasons = Object.keys(REASON_LABELS).filter((r) => issues.some((i) => i.reason === r));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">מק״טים למשפחות, לפי ספק</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
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
            <ul className="divide-y divide-line rounded-card border border-line bg-surface text-sm">
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
        <h1 className="text-title font-semibold">קיבוץ מוצרים למשפחות</h1>
        <p className="text-sm text-muted">
          המשפחות נבנות מחדש בכל סנכרון. מוצרים שלא קובצו בביטחון נשארים כאן לבדיקה במקום ניחוש.
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
