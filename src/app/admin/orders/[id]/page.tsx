import { inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { Alert } from "@/components/form";
import { OrderStatusBadge, formatDateTime } from "@/components/orders";
import { canRejectOrder, canSendQuote } from "@/domain/orders";
import { requireAdmin } from "@/lib/auth";
import { getOrderForViewer } from "@/lib/orders";
import { QuoteEditor, RejectOrderForm, type EditorLine } from "./quote-editor";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "ניהול הזמנה" };

async function AdminOrder({ params }: PageProps<"/admin/orders/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const result = await getOrderForViewer(id, admin);
  if (!result) notFound();

  const { order, team, items, quotes } = result;
  const latest = quotes[0];
  const latestLines = new Map(latest?.lines.map((line) => [line.itemId, line]));

  // The current catalog next to the frozen request, for the mentor's price and availability check.
  const live = await db
    .select({ id: schema.variants.id, priceUsd: schema.variants.priceUsd, available: schema.variants.available })
    .from(schema.variants)
    .where(
      inArray(
        schema.variants.id,
        items.map((item) => item.variantId),
      ),
    );
  const liveById = new Map(live.map((v) => [v.id, v]));

  const lines: EditorLine[] = items.map((item) => {
    const line = latestLines.get(item.id);
    const variant = liveById.get(item.variantId);
    return {
      id: item.id,
      title: item.title,
      supplierName: item.supplierName,
      supplierSku: item.supplierSku,
      options: item.options,
      productUrl: item.productUrl,
      requestedQty: item.qty,
      requestedPrice: item.unitPriceIls,
      qty: line?.qty ?? item.qty,
      unitPriceIls: line?.unitPriceIls ?? item.unitPriceIls,
      changeReason: line?.changeReason ?? "",
      livePriceUsd: variant?.priceUsd ?? null,
      liveAvailable: variant?.available ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">הזמנה {order.number}</h1>
          <p className="text-sm text-muted">
            {team.name} · <span className="ltr">{`${team.program} ${team.number}`}</span> · נשלחה{" "}
            <span className="ltr">{formatDateTime(order.submittedAt)}</span>
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <section className="grid gap-1 rounded-lg border border-line bg-surface p-4 text-sm">
        <div>
          <span className="text-muted">מסירה: </span>
          {order.deliveryMethod === "ship" ? `משלוח לכתובת: ${order.address}` : "איסוף עצמי"}
        </div>
        <div>
          <span className="text-muted">איש קשר: </span>
          {order.contactName} · <span className="ltr">{order.contactPhone}</span>
        </div>
        {order.notes && (
          <div className="whitespace-pre-wrap">
            <span className="text-muted">הערות הקבוצה: </span>
            {order.notes}
          </div>
        )}
      </section>

      {latest?.rejectionReason && order.status === "rejected" && (
        <Alert tone="info">הקבוצה דחתה את גרסה {latest.version}: {latest.rejectionReason}</Alert>
      )}
      {order.status === "approved" && (
        <Alert tone="info">הקבוצה אישרה את גרסה {latest?.version}. שליחת גרסה חדשה תחזיר את ההזמנה לאישור.</Alert>
      )}

      {canSendQuote(order.status) ? (
        <QuoteEditor
          key={latest?.id ?? "new"}
          orderId={order.id}
          lines={lines}
          shippingIls={latest?.shippingIls ?? (order.deliveryMethod === "pickup" ? 0 : null)}
          notes={latest?.notes ?? ""}
          version={(latest?.version ?? 0) + 1}
        />
      ) : (
        <Alert tone="info">ההזמנה בוטלה.</Alert>
      )}

      {canRejectOrder(order.status) && <RejectOrderForm orderId={order.id} />}

      <div className="flex gap-4 text-sm">
        <Link href={`/orders/${order.id}`} className="text-brand hover:underline">
          תצוגת הקבוצה והדפסה
        </Link>
        <Link href="/admin/orders" className="text-brand hover:underline">
          לכל ההזמנות
        </Link>
      </div>
    </div>
  );
}

export default function AdminOrderPage(props: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
      <AdminOrder {...props} />
    </Suspense>
  );
}
