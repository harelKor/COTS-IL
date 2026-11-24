import { WhatsAppLink } from "@/components/whatsapp-link";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Alert, StatusTag } from "@/components/form";
import { PaymentTerms } from "@/components/payment-terms";
import { teamMoneyLabel } from "@/domain/payments";
import { getOrderMoney, listPayments } from "@/lib/payments";
import { documentsLine, morningQuoteNumbers } from "@/domain/morning-numbers";
import { formatDateTime, QuoteTable, RequestTable } from "@/components/orders";
import { QuoteDecision } from "@/components/quote-decision";
import { QuoteView } from "@/components/quote-view";
import { PrintButton } from "@/components/print-button";
import { OrderTimeline, StageBadge } from "@/components/order-timeline";
import { ReorderButton } from "@/components/reorder-button";
import { TONE_BOX } from "@/components/order-status-tag";
import { deliveryLabel, orderStatus, statusTone, type OrderStatusKey } from "@/domain/order-status";
import { canCancelOrder, canDecideQuote, quoteTotals, teamCanOrder } from "@/domain/orders";
import { formatIls } from "@/domain/pricing";
import type { Business } from "@/domain/settings";
import { getViewer } from "@/lib/auth";
import { getChangeRequest, getOrderForViewer, getStepDates, recentDecision } from "@/lib/orders";
import { getBusiness } from "@/lib/settings";
import { orderSupplierLock } from "@/lib/purchasing";
import { db } from "@/db";
import { CancelOrder } from "./cancel-order";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { TeamName } from "@/components/team-name";

export const metadata: Metadata = { title: "הזמנה" };
// A decision's email waits out the 30 s undo window in after().
export const maxDuration = 60;

/**
 * What the team does or can expect next, above everything else: approve the quote, or
 * where and when to pick up. Nothing shows while the next move is only ours to make.
 */
function NextAction({
  stage,
  pickup,
  address,
  business,
  approveTotal,
}: {
  stage: OrderStatusKey;
  pickup: boolean;
  address: string | null;
  business: Business;
  approveTotal: number | null;
}) {
  const pickupAt = [business.pickupAddress, business.pickupHours].filter(Boolean).join(", ");
  let body: ReactNode = null;
  if (stage === "quote_sent" && approveTotal !== null) {
    body = (
      <>
        <p className="text-callout">
          לאשר את ההצעה: סה״כ לתשלום <span className="font-semibold tabular-nums">{formatIls(approveTotal)}</span>. נזמין מהספקים אחרי האישור.
        </p>
        <a href="#decision" className="btn-brand flex min-h-11 w-fit items-center rounded-full px-5 text-callout font-medium">
          לאישור ההצעה
        </a>
      </>
    );
  } else if (stage === "awaiting_quote") {
    body = (
      <p className="text-callout">
        {business.quoteLeadBusinessDays
          ? `הצעת המחיר תגיע תוך ${business.quoteLeadBusinessDays} ימי עסקים מהשליחה, בדוא״ל ובדף הזה.`
          : "הצעת המחיר תגיע בדוא״ל ובדף הזה."}
      </p>
    );
  } else if (stage === "at_warehouse") {
    body = (
      <p className="text-callout">
        {pickup ? `נכין אותה לאיסוף בקרוב${pickupAt ? `. איסוף מ: ${pickupAt}` : "."}` : `נשלח אותה בקרוב${address ? ` לכתובת: ${address}` : ""}.`}
      </p>
    );
  } else if (stage === "to_team") {
    body = <p className="text-callout">{pickup ? (pickupAt ? `איסוף מ: ${pickupAt}` : "אפשר לבוא לאסוף.") : `לכתובת: ${address ?? ""}`}</p>;
  } else return null;
  return (
    <section aria-labelledby="next-step" className={`card-surface flex flex-col gap-3 border-s-4 p-4 print:hidden ${TONE_BOX[statusTone(stage)].edge}`}>
      <h2 id="next-step" className="text-callout font-medium text-muted">הצעד הבא</h2>
      {body}
    </section>
  );
}

async function Order({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const business = await getBusiness();
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
  const pickup = order.deliveryMethod === "pickup";
  const [dates, decided, cancelled, changeRequest, lock, pay, paymentRows] = await Promise.all([
    getStepDates(order.id, order.submittedAt),
    recentDecision("quote", latest?.id),
    recentDecision("team_order", order.id),
    waitingForDecision ? getChangeRequest(latest?.id) : null,
    // A new version after lines were bought (M2): only the Israeli supplier can cancel it now.
    canCancelOrder(order.status) ? orderSupplierLock(db, order.id) : null,
    getOrderMoney(order.id),
    listPayments({ orderId: order.id }),
  ]);
  // Morning document numbers the admin typed in (no links: the owner's Morning plan has no API).
  const documents = documentsLine({ ...morningQuoteNumbers(quotes), receipts: paymentRows.filter((p) => !p.voidedAt).map((p) => p.morningDocNo) });
  const paidLabel = pay ? teamMoneyLabel(pay.money) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold">הזמנה {order.number}</h1>
          <p className="text-sm text-muted">
            <TeamName team={team} />, נשלחה{" "}
            <span className="ltr">{formatDateTime(order.submittedAt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StageBadge stage={stage} pickup={pickup} />
          <PrintButton />
        </div>
      </div>

      {order.rejectionReason && <Alert>סיבת הדחייה: {order.rejectionReason}</Alert>}
      {order.status === "cancelled" && order.cancelReason && <Alert>הספק הישראלי ביטל את ההזמנה: {order.cancelReason}</Alert>}
      {latest?.rejectionReason && order.status === "rejected" && (
        <Alert tone="info">הקבוצה דחתה את ההצעה: {latest.rejectionReason}</Alert>
      )}

      <section className="grid gap-1 card-surface p-4 text-sm">
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

      <NextAction
        stage={stage}
        pickup={pickup}
        address={order.address}
        business={business}
        approveTotal={waitingForDecision && onTeam && latest ? quoteTotals(latest.lines, latest.shippingIls).total : null}
      />

      <section className="card-surface p-4 print:hidden">
        <OrderTimeline stage={stage} stoppedAt={stoppedAt} dates={dates} pickup={pickup} />
      </section>

      {latest ? (
        <QuoteView orderNumber={order.number} team={team} items={items} quote={latest} previous={previous} progress={progress} pickup={pickup}>
          {previous && waitingForDecision && <Alert tone="info">ההצעה עודכנה מאז הגרסה הקודמת, וצריך לאשר מחדש.</Alert>}
          {changeRequest && (
            <Alert tone="info">
              ביקשתם שינוי (<span className="ltr">{formatDateTime(changeRequest.at)}</span>): {changeRequest.reason}
              <span className="block">הספק הישראלי ישלח גרסה מעודכנת.</span>
            </Alert>
          )}
          {(waitingForDecision || decided) &&
            (onTeam ? (
              <div id="decision" className="scroll-mt-20">
                <QuoteDecision
                  quoteId={latest.id}
                  decided={decided && (decided.action === "approve" || decided.action === "reject") ? { action: decided.action, at: decided.at.toISOString() } : null}
                />
              </div>
            ) : (
              !viewer.isAdmin && waitingForDecision && <Alert tone="info">ההצעה ממתינה לאישור הקבוצה.</Alert>
            ))}
        </QuoteView>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">הבקשה שנשלחה</h2>
          <p className="text-sm text-muted">המחירים נשמרו ברגע השליחה. הספק הישראלי יבדוק אותם ויוסיף עלות משלוח.</p>
          <RequestTable items={items} />
        </section>
      )}

      {pay && paidLabel && (
        <section aria-labelledby="payment-title" className="card-surface flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="payment-title" className="font-semibold">
              תשלום
            </h2>
            <StatusTag tone={paidLabel.tone}>{paidLabel.label}</StatusTag>
          </div>
          <p className="text-callout tabular-nums">
            סה״כ לתשלום {formatIls(pay.money.owed, { agorot: true })}
            {pay.money.paid > 0 && <>, שולם {formatIls(pay.money.paid, { agorot: true })}</>}
            {pay.money.left > 0 && pay.money.paid > 0 && <>, נותרו {formatIls(pay.money.left, { agorot: true })}</>}
          </p>
          {pay.money.left > 0 && <PaymentTerms />}
        </section>
      )}

      {documents && (
        <p className="card-surface px-4 py-3 text-callout">
          <span className="text-muted">מסמכים: </span>
          {documents}
        </p>
      )}

      {deliveries.length > 0 && (
        <section className="flex flex-col gap-2 card-surface p-4 text-sm print:hidden">
          <h2 className="font-semibold">תעודות משלוח</h2>
          {deliveries.map((d) => (
            <Link key={d.id} href={`/deliveries/${d.id}`} className="text-brand hover:underline">
              תעודה {d.number}, {deliveryLabel(d.status, "team", d.method === "pickup")}
            </Link>
          ))}
        </section>
      )}

      {quotes.length > 1 && (
        <details className="card-surface p-4 text-sm print:hidden">
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
        {onTeam && ((canCancelOrder(order.status) && !lock) || cancelled) && <CancelOrder orderId={order.id} cancelledAt={cancelled ? cancelled.at.toISOString() : null} />}
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
        <WhatsAppLink text="שאלה על הזמנה ב-BLUEHUB" />
      </div>
    </>
  );
}
