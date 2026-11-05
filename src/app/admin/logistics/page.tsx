import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDateTime } from "@/components/orders";
import { requireAdmin } from "@/lib/auth";
import { listShipments } from "@/lib/logistics";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "משלוחים" };

async function Shipments() {
  await requireAdmin();
  const shipments = await listShipments();

  if (shipments.length === 0) {
    return (
      <p className="text-muted">
        עדיין אין משלוחים. פותחים משלוח מתוך{" "}
        <Link href="/admin/purchasing" className="text-brand hover:underline">
          הזמנת ספק שבוצעה
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-muted">
          <tr>
            <th className="px-4 py-2 text-start font-medium">משלוח</th>
            <th className="px-4 py-2 text-start font-medium">הזמנת ספק</th>
            <th className="px-4 py-2 text-start font-medium">שילוח</th>
            <th className="px-4 py-2 text-start font-medium">התקבל</th>
            <th className="px-4 py-2 text-start font-medium">נוצר</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="px-4 py-2">
                <Link href={`/admin/logistics/${s.id}`} className="text-brand hover:underline">
                  {s.number}
                </Link>
              </td>
              <td className="px-4 py-2">
                <Link href={`/admin/purchasing/${s.poId}`} className="hover:text-brand">
                  {s.poNumber} · <span className="ltr">{s.supplierName}</span>
                </Link>
              </td>
              <td className="ltr px-4 py-2">{[s.carrier, s.tracking].filter(Boolean).join(" ")}</td>
              <td className="whitespace-nowrap px-4 py-2">
                <span className={s.received >= s.shipped ? "text-success" : "text-warning"}>
                  {s.received} מתוך {s.shipped}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <span className="ltr">{formatDateTime(s.createdAt)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LogisticsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">משלוחים וקליטה</h1>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          לניהול
        </Link>
      </div>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Shipments />
      </Suspense>
    </div>
  );
}
