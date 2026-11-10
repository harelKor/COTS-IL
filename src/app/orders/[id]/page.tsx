import { WhatsAppLink } from "@/components/whatsapp-link";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Alert, Button } from "@/components/form";
import { formatDateTime, QuoteTable, RequestTable } from "@/components/orders";
import { PrintButton } from "@/components/print-button";
import { OrderTimeline, StageBadge } from "@/components/order-timeline";
import { ReorderButton } from "@/components/reorder-button";
import { orderStatus } from "@/domain/order-status";
import { canCancelOrder, canDecideQuote, teamCanOrder } from "@/domain/orders";
import { getViewer } from "@/lib/auth";
import { getOrderForViewer } from "@/lib/orders";
import { cancelOrder } from "../actions";
import { QuoteDecision } from "./quote-decision";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "הזמנה" };

async function Order({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/orders/${encodeURIComponent(id)}`);

  const result = await getOrderForViewer(id, viewer);
  if (!result) notFound();

  const { order, team, membership, items, quotes, progress, deliveries } = result;
  const [latest, previous] = quotes;
  // Anyone signed in to the team can approve, reorder and cancel (D11).
  const onTeam = !!membership && teamCanOrder(membership.status);
  const stage = orderStatus(order.status, [...progress.values()]).status;
  const stoppedAt = latest ? "quote_sent" : "awaiting_quote";
  const waitingForDecision = latest?.status === "sent" && canDecideQuote(order.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">הזמנה {order.number}</h1>
          <p className="text-sm text-muted">
            {team.name}, <span className="ltr">{`${team.program} ${team.number}`}</span>, נשלחה{" "}
            <span className="ltr">{formatDateTime(order.submittedAt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StageBadge stage={stage} />
          <PrintButton />
        </div>
      </div>

      {order.rejectionReason && <Alert>סיבת הדחייה: {order.rejectionReason}</Alert>}
      {latest?.rejectionReason && order.status === "rejected" && (
        <Alert tone="info">הקבוצה דחתה את ההצעה: {latest.rejectionReason}</Alert>
      )}

      <section className="grid gap-1 rounded-lg border border-line bg-surface p-4 text-sm">
        <div>
          <span className="text-muted">מסירה: </span>
          {order.deliveryMethod === "ship" ? `משלוח לכתובת: ${order.address}` : "איסוף עצמי"}
        </div>
        <div>
          <span className="text-muted">איש קשר: </span>
          {order.contactName}, <span className="ltr">{order.contactPhone}</span>
        </div>
        {order.notes && (
          <div className="whitespace-pre-wrap">
            <span className="text-muted">הערות: </span>
            {order.notes}
          </div>
        )}
      </section>

      <section className="rounded-card bg-surface p-4 print:hidden">
        <OrderTimeline stage={stage} stoppedAt={stoppedAt} />
      </section>

      {latest ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">
            הצעה סופית, גרסה {latest.version}{" "}
            <span className="text-xs font-normal text-muted">
              <span className="ltr">{formatDateTime(latest.sentAt)}</span>
            </span>
          </h2>
          {previous && waitingForDecision && (
            <Alert tone="info">ההצעה עודכנה מאז הגרסה הקודמת. השינויים מסומנים בטבלה, וצריך לאשר מחדש.</Alert>
          )}
          <QuoteTable quote={latest} previous={previous} items={items} progress={progress} />
          {latest.notes && <p className="whitespace-pre-wrap text-sm">הערות הספק הישראלי: {latest.notes}</p>}
          {waitingForDecision &&
            (onTeam ? (
              <QuoteDecision quoteId={latest.id} />
            ) : (
              !viewer.isAdmin && <Alert tone="info">ההצעה ממתינה לאישור הקבוצה.</Alert>
            ))}
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">הבקשה שנשלחה</h2>
          <p className="text-sm text-muted">המחירים נשמרו ברגע השליחה. הספק הישראלי יבדוק אותם ויוסיף עלות משלוח.</p>
          <RequestTable items={items} />
        </section>
      )}

      {deliveries.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 text-sm print:hidden">
          <h2 className="font-semibold">תעודות משלוח</h2>
          {deliveries.map((d) => (
            <Link key={d.id} href={`/deliveries/${d.id}`} className="text-brand hover:underline">
              תעודה {d.number}, {d.status === "delivered" ? "נמסרה" : "בהכנה"}
            </Link>
          ))}
        </section>
      )}

      {quotes.length > 1 && (
        <details className="rounded-lg border border-line bg-surface p-4 text-sm print:hidden">
          <summary className="cursor-pointer">גרסאות קודמות ({quotes.length - 1})</summary>
          <div className="mt-3 flex flex-col gap-4">
            {quotes.slice(1).map((quote, i) => (
              <div key={quote.id}>
                <h3 className="mb-2 font-medium">
                  גרסה {quote.version}, <span className="ltr">{formatDateTime(quote.sentAt)}</span>
                </h3>
                <QuoteTable quote={quote} previous={quotes[i + 2]} items={items} />
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href={viewer.isAdmin ? `/admin?open=${order.id}` : "/orders"} className="text-sm text-brand hover:underline">
          {viewer.isAdmin ? "לניהול ההזמנה" : "לכל ההזמנות"}
        </Link>
        {onTeam && <ReorderButton orderId={order.id} />}
        {onTeam && canCancelOrder(order.status) && (
          <form action={cancelOrder}>
            <input type="hidden" name="orderId" value={order.id} />
            <Button variant="ghost">ביטול ההזמנה</Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function OrderPage(props: PageProps<"/orders/[id]">) {
  return (
    <>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Order {...props} />
      </Suspense>
      <div className="mt-6">
        <WhatsAppLink text="שאלה על הזמנה ב-COTS-IL" />
      </div>
    </>
  );
}
