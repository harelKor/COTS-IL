import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { Button, Field, Input } from "@/components/form";
import { formatDateTime } from "@/components/orders";
import { PrintButton } from "@/components/print-button";
import { formatIls } from "@/domain/pricing";
import {
  averageHours,
  formatDuration,
  medianHours,
  periodPresets,
  profitSummary,
  purchaseCost,
} from "@/domain/reports";
import { requireAdmin } from "@/lib/auth";
import { getImportCosts, getPurchases, getSales, parsePeriod } from "@/lib/reports";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "דוחות" };

const COST_LABELS = {
  customs: "מכס",
  freight: "הובלה",
  broker: "עמיל מכס",
  vat: "מע״מ יבוא",
} as const;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card-surface p-4">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {note && <div className="text-caption text-muted">{note}</div>}
    </div>
  );
}

function ExportLink({ type, query }: { type: string; query: string }) {
  return (
    <a href={`/admin/reports/export?type=${type}${query}`} className="text-sm text-brand hover:underline print:hidden">
      ייצוא ל-Excel
    </a>
  );
}

async function Reports({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdmin();
  const params = await searchParams;
  const period = parsePeriod(params);
  const rate = Number(params.rate);
  const overrideRate = Number.isFinite(rate) && rate > 0 ? rate : null;

  const [sales, purchases, costs] = await Promise.all([getSales(period), getPurchases(period), getImportCosts(period)]);

  const revenueIls = sales.reduce((sum, s) => sum + s.subtotalIls + s.shippingIls, 0);
  const purchase = purchaseCost(sales, overrideRate);
  const quotePairs = sales.map((s) => ({
    start: s.submittedAt,
    end: s.firstQuoteAt,
  }));
  const approvePairs = sales.map((s) => ({
    start: s.submittedAt,
    end: s.approvedAt,
  }));
  const avg = averageHours;
  const unboughtUnits = sales.reduce((sum, s) => sum + Math.max(s.quotedUnits - s.boughtUnits, 0), 0);
  const profit = profitSummary({
    revenueIls,
    purchaseIls: purchase.ils,
    importCosts: costs,
  });
  const presets = periodPresets(new Date());
  const presetHref = (p: { from?: string; to?: string }) => {
    const q = new URLSearchParams(
      Object.entries({
        from: p.from,
        to: p.to,
        rate: overrideRate?.toString(),
      }).flatMap(([k, v]) => (v ? [[k, v]] : [])),
    ).toString();
    return q ? `/admin/reports?${q}` : "/admin/reports";
  };

  const query = new URLSearchParams(
    Object.entries({
      from: period.from,
      to: period.to,
      rate: overrideRate?.toString(),
    }).flatMap(([k, v]) => (v ? [[k, v]] : [])),
  ).toString();
  const suffix = query ? `&${query}` : "";

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="טווחי תאריכים" className="flex flex-wrap gap-2 print:hidden">
        {presets.map((p) => {
          const active = (p.from ?? "") === (period.from ?? "") && (p.to ?? "") === (period.to ?? "");
          return (
            <Link
              key={p.key}
              href={presetHref(p)}
              aria-current={active ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-callout ${active ? "border-brand bg-subtle font-medium text-brand" : "border-line text-muted hover:bg-subtle"}`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>
      <Form action="/admin/reports" className="flex flex-wrap items-end gap-3 card-surface p-4 print:hidden">
        <Field label="מתאריך" name="from">
          <Input name="from" type="date" lang="he-IL" defaultValue={period.from} />
        </Field>
        <Field label="עד תאריך" name="to">
          <Input name="to" type="date" lang="he-IL" defaultValue={period.to} />
        </Field>
        <Field
          label="שער דולר (לא חובה)"
          name="rate"
          hint="ריק: שער בנק ישראל ביום כל הזמנת ספק. אפשר להזין את השער האמיתי מהכרטיס."
        >
          <Input name="rate" type="number" min={0} step="0.001" dir="ltr" defaultValue={overrideRate ?? undefined} />
        </Field>
        <Button variant="secondary">הצגה</Button>
      </Form>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">רווחיות</h2>
          <ExportLink type="profit" query={suffix} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="מכירות" value={formatIls(revenueIls)} note={`${sales.length} הזמנות מאושרות`} />
          <Stat label="רכש מהספקים" value={usd.format(purchase.usd)} />
          <Stat
            label="רכש בשקלים"
            value={formatIls(profit.purchaseIls)}
            note={
              purchase.source === "override"
                ? `לפי שער ידני ${purchase.rate}`
                : purchase.rate
                  ? `לפי שער בנק ישראל ביום ההזמנה, ממוצע ${purchase.rate.toFixed(3)}`
                  : "לפי שער בנק ישראל ביום ההזמנה"
            }
          />
          <Stat
            label="רווח"
            value={formatIls(profit.profit)}
            note={profit.marginPct === null ? undefined : `${profit.marginPct.toFixed(1)}% מהמכירות`}
          />
          <Stat label="עלויות יבוא" value={formatIls(profit.importCostIls)} />
          <Stat label="מע״מ בר קיזוז" value={formatIls(profit.reclaimableVatIls)} note="לא נספר כעלות" />
        </div>
        {unboughtUnits > 0 && (
          <p className="text-sm text-warning">
            עדיין לא נקנו {unboughtUnits} יחידות מההזמנות האלה, אז עלות הרכש חסרה והרווח כאן גבוה מהצפוי.
          </p>
        )}
        <p className="text-caption text-muted">
          הכנסות ורכש לפי הזמנות שנשלחו בתקופה. עלויות יבוא לפי תאריך הרישום שלהן, ולכן בתקופה קצרה הן עשויות לא להתאים
          בדיוק להזמנות.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">מכירות וזמני טיפול</h2>
          <ExportLink type="sales" query={suffix} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="זמן מבקשה להצעה"
            value={`ממוצע ${formatDuration(avg(quotePairs))}`}
            note={`חציון ${formatDuration(medianHours(quotePairs))}`}
          />
          <Stat
            label="זמן מבקשה לאישור"
            value={`ממוצע ${formatDuration(avg(approvePairs))}`}
            note={`חציון ${formatDuration(medianHours(approvePairs))}`}
          />
        </div>
        {sales.length > 0 && (
          <div className="overflow-x-auto card-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-muted">
                <tr>
                  <th className="p-2 text-start font-medium">הזמנה</th>
                  <th className="p-2 text-start font-medium">קבוצה</th>
                  <th className="p-2 text-start font-medium">תאריך הבקשה</th>
                  <th className="p-2 text-start font-medium">פריטים</th>
                  <th className="p-2 text-start font-medium">משלוח</th>
                  <th className="p-2 text-start font-medium">סה״כ</th>
                  <th className="p-2 text-start font-medium">רכש</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.orderId} className="border-t border-line">
                    <td className="p-2">
                      <Link href={`/admin?open=${s.orderId}`} className="text-brand hover:underline">
                        {s.number}
                      </Link>
                    </td>
                    <td className="ltr whitespace-nowrap p-2">{`${s.teamProgram} ${s.teamNumber}`}</td>
                    <td className="whitespace-nowrap p-2">
                      <span className="ltr">{formatDateTime(s.submittedAt)}</span>
                    </td>
                    <td className="whitespace-nowrap p-2">{formatIls(s.subtotalIls)}</td>
                    <td className="whitespace-nowrap p-2">{formatIls(s.shippingIls)}</td>
                    <td className="whitespace-nowrap p-2 font-semibold">{formatIls(s.subtotalIls + s.shippingIls)}</td>
                    <td className="whitespace-nowrap p-2">{usd.format(s.purchaseUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">רכש מרוכז</h2>
          <ExportLink type="purchasing" query={suffix} />
        </div>
        {purchases.length === 0 ? (
          <p className="text-muted">אין הזמנות ספק שבוצעו בתקופה.</p>
        ) : (
          <div className="overflow-x-auto card-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-muted">
                <tr>
                  <th className="p-2 text-start font-medium">הזמנת ספק</th>
                  <th className="p-2 text-start font-medium">ספק</th>
                  <th className="p-2 text-start font-medium">אסמכתא</th>
                  <th className="p-2 text-start font-medium">יחידות</th>
                  <th className="p-2 text-start font-medium">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="p-2">
                      <Link href={`/admin/purchasing/${p.id}`} className="text-brand hover:underline">
                        {p.number}
                      </Link>
                    </td>
                    <td className="ltr p-2">{p.supplierName}</td>
                    <td className="ltr p-2">{p.supplierOrderRef}</td>
                    <td className="p-2">{p.units}</td>
                    <td className="whitespace-nowrap p-2">{usd.format(p.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">עלויות יבוא</h2>
          <ExportLink type="imports" query={suffix} />
        </div>
        {costs.length === 0 ? (
          <p className="text-muted">אין עלויות יבוא בתקופה.</p>
        ) : (
          <div className="overflow-x-auto card-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-muted">
                <tr>
                  <th className="p-2 text-start font-medium">משלוח</th>
                  <th className="p-2 text-start font-medium">סוג</th>
                  <th className="p-2 text-start font-medium">סכום</th>
                  <th className="p-2 text-start font-medium">בר קיזוז</th>
                  <th className="p-2 text-start font-medium">אסמכתא</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="p-2">
                      <Link href={`/admin/logistics/${c.shipmentId}`} className="text-brand hover:underline">
                        {c.shipmentNumber}
                      </Link>{" "}
                      <span className="ltr text-caption text-muted">{c.supplierName}</span>
                    </td>
                    <td className="p-2">{COST_LABELS[c.type]}</td>
                    <td className="whitespace-nowrap p-2">{formatIls(c.amountIls)}</td>
                    <td className="p-2">{c.vatReclaimable ? "כן" : "לא"}</td>
                    <td className="ltr p-2">{c.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="print:hidden">
        <Link href="/admin/shortages" className="text-sm text-brand hover:underline">
          לדוח החוסרים
        </Link>
        , <ExportLink type="shortages" query={suffix} />
      </p>
    </div>
  );
}

export default function ReportsPage(props: PageProps<"/admin/reports">) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-title font-semibold">דוחות</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-brand hover:underline print:hidden">
            לניהול
          </Link>
          <PrintButton />
        </div>
      </div>
      <Suspense
        fallback={
          <Loading>
            <PageSkeleton />
          </Loading>
        }
      >
        <Reports {...props} />
      </Suspense>
    </div>
  );
}
