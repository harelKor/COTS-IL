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
import { waitingFirst } from "@/domain/quote-view";

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

  const { waiting, rest } = waitingFirst(orders, stages);
  const row = (order: (typeof orders)[number]) => (
    <li key={order.id} className="flex flex-wrap items-center gap-3 card-surface p-4">
      <Link href={`/orders/${order.id}`} className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center justify-between gap-3 hover:text-brand">
        <div>
          <div className="font-medium">הזמנה {order.number}</div>
          <div className="text-caption text-muted">
            <span className="ltr">{formatDateTime(order.submittedAt)}</span>, {order.lineCount} שורות
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-end">
            <span className="block text-callout font-semibold">{formatIls(order.quoteTotal ?? order.requestTotal)}</span>
            <span className="block text-caption text-muted">{order.quoteTotal === null ? "הערכה, לפני הצעה" : "לפי ההצעה"}</span>
          </span>
          <StageBadge stage={stages.get(order.id)!} pickup={order.deliveryMethod === "pickup"} />
        </div>
      </Link>
      <ReorderButton orderId={order.id} />
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      {waiting.length > 0 && (
        <section aria-labelledby="waiting" className="flex flex-col gap-3">
          <h2 id="waiting" className="text-section font-semibold">
            ממתין לאישורכם
          </h2>
          <ul className="flex flex-col gap-3">{waiting.map(row)}</ul>
        </section>
      )}
      {rest.length > 0 && (
        <section aria-labelledby="all" className="flex flex-col gap-3">
          {waiting.length > 0 && (
            <h2 id="all" className="text-section font-semibold">
              כל ההזמנות
            </h2>
          )}
          <ul className="flex flex-col gap-3">{rest.map(row)}</ul>
        </section>
      )}
    </div>
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
