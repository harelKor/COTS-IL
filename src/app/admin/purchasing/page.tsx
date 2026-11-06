import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/form";
import { formatDateTime } from "@/components/orders";
import { consolidateDemand, describeOptions, type SupplierDemand } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getDemand, listPos } from "@/lib/purchasing";
import { createPo } from "./actions";
import { PO_STATUS_LABELS } from "./status";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "רכש" };

function SupplierBoard({ demand }: { demand: SupplierDemand }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-subtle p-3">
        <h3 className="ltr font-semibold">{demand.supplierName}</h3>
        <form action={createPo}>
          <input type="hidden" name="supplierId" value={demand.supplierId} />
          <Button>הוספה להזמנת ספק</Button>
        </form>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr>
              <th className="p-3 text-start font-medium">פריט</th>
              <th className="p-3 text-start font-medium">כמות</th>
              <th className="p-3 text-start font-medium">שיוך לקבוצות</th>
            </tr>
          </thead>
          <tbody>
            {demand.lines.map((line) => (
              <tr key={line.variantId} className="border-t border-line align-top">
                <td dir="ltr" className="p-3 text-start">
                  <div className="font-medium">{line.title}</div>
                  <div className="text-xs text-muted">
                    {[describeOptions(line.options), line.supplierSku ?? "no supplier SKU"].filter(Boolean).join(", ")}
                  </div>
                </td>
                <td className="p-3 font-semibold">{line.qty}</td>
                <td className="p-3 text-xs">
                  {line.allocations.map((a) => (
                    <div key={a.orderItemId}>
                      <span className="ltr">{a.teamLabel}</span>, הזמנה {a.orderNumber}: {a.qty}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function Purchasing() {
  await requireAdmin();
  const [demandRows, pos] = await Promise.all([getDemand(), listPos()]);
  const demand = consolidateDemand(demandRows);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">לקנות מהספקים</h2>
        {demand.length === 0 ? (
          <p className="text-muted">אין כרגע שורות מאושרות שממתינות לרכש.</p>
        ) : (
          demand.map((d) => <SupplierBoard key={d.supplierId} demand={d} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">הזמנות ספק</h2>
        {pos.length === 0 ? (
          <p className="text-muted">עדיין אין הזמנות ספק.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">מספר</th>
                  <th className="px-4 py-2 text-start font-medium">ספק</th>
                  <th className="px-4 py-2 text-start font-medium">שורות</th>
                  <th className="px-4 py-2 text-start font-medium">אסמכתא אצל הספק</th>
                  <th className="px-4 py-2 text-start font-medium">נוצרה</th>
                  <th className="px-4 py-2 text-start font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {pos.map((po) => (
                  <tr key={po.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <Link href={`/admin/purchasing/${po.id}`} className="text-brand hover:underline">
                        {po.number}
                      </Link>
                    </td>
                    <td className="ltr px-4 py-2">{po.supplierName}</td>
                    <td className="px-4 py-2">{po.lineCount}</td>
                    <td className="ltr px-4 py-2">{po.supplierOrderRef}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className="ltr">{formatDateTime(po.createdAt)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{PO_STATUS_LABELS[po.status]}</td>
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

export default function PurchasingPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">רכש</h1>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          לניהול
        </Link>
      </div>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Purchasing />
      </Suspense>
    </div>
  );
}
