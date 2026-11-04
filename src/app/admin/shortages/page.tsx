import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { LINE_STAGE_LABELS, lineStage } from "@/domain/logistics";
import { requireAdmin } from "@/lib/auth";
import { getItemProgress, getSupplierShortages } from "@/lib/logistics";

export const metadata: Metadata = { title: "דוח חוסרים | פורטל רכש FIRST" };

async function Shortages() {
  await requireAdmin();
  const [items, lines] = await Promise.all([getItemProgress(), getSupplierShortages()]);
  const openItems = items.filter((i) => i.quoted > i.delivered);
  const shortLines = lines.filter((l) => l.received - l.damaged < l.ordered);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">מה עדיין לא נמסר לקבוצות ({openItems.length})</h2>
        {openItems.length === 0 ? (
          <p className="text-muted">כל השורות המאושרות נמסרו.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-muted">
                <tr>
                  <th className="p-2 text-start font-medium">קבוצה</th>
                  <th className="p-2 text-start font-medium">פריט</th>
                  <th className="p-2 text-start font-medium">אושר</th>
                  <th className="p-2 text-start font-medium">הוזמן</th>
                  <th className="p-2 text-start font-medium">הוקצה</th>
                  <th className="p-2 text-start font-medium">נמסר</th>
                  <th className="p-2 text-start font-medium">חסר</th>
                  <th className="p-2 text-start font-medium">מצב</th>
                </tr>
              </thead>
              <tbody>
                {openItems.map((item) => (
                  <tr key={item.orderItemId} className="border-t border-line align-top">
                    <td className="whitespace-nowrap p-2">
                      <Link href={`/admin/orders/${item.orderId}`} className="hover:text-brand">
                        <span className="ltr">{`${item.teamProgram} ${item.teamNumber}`}</span> #{item.orderNumber}
                      </Link>
                    </td>
                    <td dir="ltr" className="p-2 text-start">
                      {item.title}
                      <div className="text-xs text-muted">{item.supplierSku ?? "no supplier SKU"}</div>
                    </td>
                    <td className="p-2">{item.quoted}</td>
                    <td className="p-2">{item.ordered}</td>
                    <td className="p-2">{item.allocated}</td>
                    <td className="p-2">{item.delivered}</td>
                    <td className="p-2 font-semibold text-warning">{item.quoted - item.delivered}</td>
                    <td className="whitespace-nowrap p-2 text-xs">{LINE_STAGE_LABELS[lineStage(item)]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">מה עדיין לא הגיע מהספקים ({shortLines.length})</h2>
        {shortLines.length === 0 ? (
          <p className="text-muted">כל מה שהוזמן התקבל תקין.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-muted">
                <tr>
                  <th className="p-2 text-start font-medium">הזמנת ספק</th>
                  <th className="p-2 text-start font-medium">פריט</th>
                  <th className="p-2 text-start font-medium">הוזמן</th>
                  <th className="p-2 text-start font-medium">נשלח</th>
                  <th className="p-2 text-start font-medium">התקבל</th>
                  <th className="p-2 text-start font-medium">פגום</th>
                  <th className="p-2 text-start font-medium">חסר</th>
                </tr>
              </thead>
              <tbody>
                {shortLines.map((line) => (
                  <tr key={`${line.poId}-${line.supplierSku}-${line.title}`} className="border-t border-line align-top">
                    <td className="whitespace-nowrap p-2">
                      <Link href={`/admin/purchasing/${line.poId}`} className="hover:text-brand">
                        {line.poNumber} · <span className="ltr">{line.supplierName}</span>
                      </Link>
                    </td>
                    <td dir="ltr" className="p-2 text-start">
                      {line.title}
                      <div className="text-xs text-muted">{line.supplierSku ?? "no supplier SKU"}</div>
                    </td>
                    <td className="p-2">{line.ordered}</td>
                    <td className="p-2">{line.shipped}</td>
                    <td className="p-2">{line.received}</td>
                    <td className="p-2">{line.damaged}</td>
                    <td className="p-2 font-semibold text-warning">{line.ordered - (line.received - line.damaged)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function ShortagesPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">דוח חוסרים</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-brand hover:underline print:hidden">
            לניהול
          </Link>
          <PrintButton />
        </div>
      </div>
      <Suspense fallback={<p className="text-muted">טוען…</p>}>
        <Shortages />
      </Suspense>
    </div>
  );
}
