import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { formatDateTime, OrderStatusBadge } from "@/components/orders";
import { formatIls } from "@/domain/pricing";
import { activeTeam, getViewer } from "@/lib/auth";
import { listOrders } from "@/lib/orders";

export const metadata: Metadata = { title: "ההזמנות שלנו | פורטל רכש FIRST" };

async function Orders() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/orders");
  if (viewer.isAdmin && !activeTeam(viewer)) redirect("/admin/orders");
  const team = activeTeam(viewer);
  if (!team) redirect("/pending");

  const orders = await listOrders(team.id);
  if (orders.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-muted">
        עדיין אין הזמנות.{" "}
        <Link href="/catalog" className="text-brand hover:underline">
          לקטלוג
        </Link>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/orders/${order.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 hover:border-brand"
          >
            <div>
              <div className="font-medium">הזמנה {order.number}</div>
              <div className="text-xs text-muted">
                {formatDateTime(order.submittedAt)} · {order.lineCount} שורות
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{formatIls(order.quoteTotal ?? order.requestTotal)}</span>
              <OrderStatusBadge status={order.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function OrdersPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">ההזמנות שלנו</h1>
      <Suspense fallback={<p className="text-muted">טוען…</p>}>
        <Orders />
      </Suspense>
    </div>
  );
}
