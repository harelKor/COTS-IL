import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StageBadge } from "@/components/order-timeline";
import { formatDateTime } from "@/components/orders";
import { ReorderButton } from "@/components/reorder-button";
import { formatIls } from "@/domain/pricing";
import { getViewer, orderingTeam } from "@/lib/auth";
import { getOrderStages, listOrders } from "@/lib/orders";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "ההזמנות שלנו" };

async function Orders() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/orders");
  if (viewer.isAdmin && !orderingTeam(viewer)) redirect("/admin");
  const team = orderingTeam(viewer);
  if (!team) redirect("/pending");

  const orders = await listOrders(team.id);
  const stages = await getOrderStages(orders);
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
        <li key={order.id} className="flex flex-wrap items-center gap-3 rounded-card bg-surface p-4">
          <Link href={`/orders/${order.id}`} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 hover:text-brand">
            <div>
              <div className="font-medium">הזמנה {order.number}</div>
              <div className="text-caption text-muted">
                {formatDateTime(order.submittedAt)}, {order.lineCount} שורות
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{formatIls(order.quoteTotal ?? order.requestTotal)}</span>
              <StageBadge stage={stages.get(order.id)!} />
            </div>
          </Link>
          <ReorderButton orderId={order.id} />
        </li>
      ))}
    </ul>
  );
}

export default function OrdersPage() {
  return (
    <div>
      <h1 className="mb-6 text-title font-semibold">ההזמנות שלנו</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Orders />
      </Suspense>
    </div>
  );
}
