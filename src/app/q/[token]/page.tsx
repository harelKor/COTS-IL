import { WhatsAppLink } from "@/components/whatsapp-link";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { quoteTotals } from "@/domain/orders";
import { formatIls } from "@/domain/pricing";
import { readApproveLink } from "@/lib/quote-links";
import { ApproveForm } from "./approve-form";
import { TeamName } from "@/components/team-name";
import { PaymentTerms } from "@/components/payment-terms";

export const metadata: Metadata = { title: "אישור הצעת מחיר", robots: { index: false, follow: false } };

async function Approval({ params }: PageProps<"/q/[token]">) {
  await connection();
  const token = decodeURIComponent((await params).token);
  const link = await readApproveLink(token);

  if (!link.ok) {
    return (
      <div className="flex flex-col gap-3 rounded-card bg-surface p-6">
        <p className="font-semibold">{link.reason}</p>
        {"orderId" in link && link.orderId && (
          <Link href={`/orders/${link.orderId}`} className="text-brand hover:underline">
            לפתיחת הזמנה {link.orderNumber} (דורש כניסה)
          </Link>
        )}
      </div>
    );
  }

  const totals = quoteTotals(link.lines, link.quote.shippingIls);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-caption text-muted">
          <TeamName team={link.team} />, עבור {link.member}
        </p>
        <h1 className="text-title font-semibold">
          הצעת מחיר להזמנה {link.orderNumber}, גרסה {link.quote.version}
        </h1>
      </div>
      <ul className="rounded-card bg-surface px-4">
        {link.lines.map((l, i) => (
          <li key={i} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
            <span className="min-w-0 flex-1">
              <Ltr className="line-clamp-2 text-start text-[15px]">{l.title}</Ltr>
              {l.supplierSku && <Ltr className="block font-mono text-caption text-muted">{l.supplierSku}</Ltr>}
            </span>
            <span className="shrink-0 text-caption text-muted tabular-nums">×{l.qty}</span>
            <span className="w-20 shrink-0 text-end tabular-nums">{formatIls(l.qty * l.unitPriceIls)}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1 rounded-card bg-surface p-4">
        <div className="flex justify-between text-muted">
          <dt>פריטים</dt>
          <dd className="tabular-nums">{formatIls(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-muted">
          <dt>משלוח</dt>
          <dd className="tabular-nums">{formatIls(totals.shipping)}</dd>
        </div>
        <div className="flex justify-between text-section font-semibold">
          <dt>סה״כ</dt>
          <dd className="tabular-nums">{formatIls(totals.total)}</dd>
        </div>
      </dl>
      <PaymentTerms />
      {link.quote.notes && <p className="whitespace-pre-wrap text-caption">הערות הספק הישראלי: {link.quote.notes}</p>}
      <ApproveForm token={token} />
      <p className="text-caption text-muted">
        האישור נרשם על שמך. רוצים לדחות או לשאול שאלה?{" "}
        <Link href={`/orders/${link.orderId}`} className="text-brand hover:underline">
          פתיחת ההזמנה
        </Link>
      </p>
    </div>
  );
}

export default function ApprovePage(props: PageProps<"/q/[token]">) {
  return (
    <div className="mx-auto max-w-xl">
      <Suspense
        fallback={
          <Loading>
            <PageSkeleton rows={4} />
          </Loading>
        }
      >
        <Approval {...props} />
      </Suspense>
      <div className="mt-6">
        <WhatsAppLink text="שאלה על הצעת מחיר ב-COTS-IL" />
      </div>
    </div>
  );
}
