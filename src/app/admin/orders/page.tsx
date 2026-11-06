import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatDateTime, OrderStatusBadge } from "@/components/orders";
import { formatIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { listOrders } from "@/lib/orders";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "הזמנות קבוצות" };

async function Orders() {
  await requireAdmin();
  const orders = await listOrders();

  if (orders.length === 0) return <p className="text-muted">עדיין אין הזמנות.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-muted">
          <tr>
            <th className="px-4 py-2 text-start font-medium">הזמנה</th>
            <th className="px-4 py-2 text-start font-medium">קבוצה</th>
            <th className="px-4 py-2 text-start font-medium">נשלחה</th>
            <th className="px-4 py-2 text-start font-medium">סכום</th>
            <th className="px-4 py-2 text-start font-medium">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-line">
              <td className="px-4 py-2">
                <Link href={`/admin/orders/${order.id}`} className="text-brand hover:underline">
                  {order.number}
                </Link>
              </td>
              <td className="px-4 py-2">
                {order.teamName} · <span className="ltr">{`${order.teamProgram} ${order.teamNumber}`}</span>
                {order.teamStatus === "pending" && <span className="ms-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">קבוצה חדשה, ממתינה לאישור</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <span className="ltr">{formatDateTime(order.submittedAt)}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-2">{formatIls(order.quoteTotal ?? order.requestTotal)}</td>
              <td className="whitespace-nowrap px-4 py-2">
                <OrderStatusBadge status={order.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">הזמנות קבוצות</h1>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          לניהול הקבוצות
        </Link>
      </div>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Orders />
      </Suspense>
    </div>
  );
}
