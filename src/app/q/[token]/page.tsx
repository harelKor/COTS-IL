import { WhatsAppLink } from "@/components/whatsapp-link";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { PrintButton } from "@/components/print-button";
import { QuoteDecision } from "@/components/quote-decision";
import { QuoteView } from "@/components/quote-view";
import { TeamName } from "@/components/team-name";
import { loadOrderById, recentDecision } from "@/lib/orders";
import { readApproveLink } from "@/lib/quote-links";
import { RequestLink } from "./request-link";

export const metadata: Metadata = { title: "אישור הצעת מחיר", robots: { index: false, follow: false } };
// A decision's email waits out the 30 s undo window in after().
export const maxDuration = 60;

function OrderLink({ orderId, orderNumber }: { orderId: string; orderNumber: number }) {
  return (
    <Link href={`/orders/${orderId}`} className="inline-flex min-h-11 items-center text-brand hover:underline">
      לפתיחת הזמנה {orderNumber} (דורש כניסה)
    </Link>
  );
}

async function Approval({ params }: PageProps<"/q/[token]">) {
  await connection();
  const token = decodeURIComponent((await params).token);
  const link = await readApproveLink(token);

  if (!link.ok) {
    // Approved or rejected from this link a moment ago: keep the Undo on screen for its 30 s.
    const quoteId = "quoteId" in link ? link.quoteId : undefined;
    const decided = await recentDecision("quote", quoteId);
    if (decided && quoteId && (decided.action === "approve" || decided.action === "reject")) {
      return <QuoteDecision quoteId={quoteId} token={token} decided={{ action: decided.action, at: decided.at.toISOString() }} />;
    }
    return (
      <div className="flex flex-col gap-3 card-surface p-6">
        <p className="font-semibold">{link.reason}</p>
        {"expired" in link && link.expired && <RequestLink token={token} />}
        {"orderId" in link && link.orderId && <OrderLink orderId={link.orderId} orderNumber={link.orderNumber} />}
      </div>
    );
  }

  const detail = await loadOrderById(link.orderId);
  if (!detail) return null;
  const [latest, previous] = detail.quotes;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <p className="text-caption text-muted">
            <TeamName team={link.team} />, עבור {link.member}
          </p>
          <h1 className="text-title font-semibold">הצעת מחיר להזמנה {link.orderNumber}</h1>
        </div>
        <PrintButton />
      </div>
      <QuoteView
        orderNumber={detail.order.number}
        team={detail.team}
        items={detail.items}
        quote={latest}
        previous={previous}
        linkExpiresAt={new Date(link.claims.expiresAt)}
      >
        <QuoteDecision quoteId={latest.id} token={token} />
        <p className="text-caption text-muted print:hidden">
          התשובה נרשמת על שם <bdi>{link.member}</bdi>. <OrderLink orderId={link.orderId} orderNumber={link.orderNumber} />
        </p>
      </QuoteView>
    </div>
  );
}

export default function ApprovePage(props: PageProps<"/q/[token]">) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense
        fallback={
          <Loading>
            <PageSkeleton rows={4} />
          </Loading>
        }
      >
        <Approval {...props} />
      </Suspense>
      <div className="mt-6 print:hidden">
        <WhatsAppLink text="שאלה על הצעת מחיר ב-BLUEHUB" />
      </div>
    </div>
  );
}
