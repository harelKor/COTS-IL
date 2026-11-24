import Link from "next/link";
import { StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { formatDay } from "@/domain/display";
import { METHOD_LABEL, MONEY_ADMIN, type OrderMoney, type PaymentMethod } from "@/domain/payments";
import { formatIls } from "@/domain/pricing";
import type { PaymentRow } from "@/lib/payments";
import { IssuePaymentDocument } from "../morning/morning-forms";
import { PaymentDocNo, VoidPayment } from "./payment-forms";

/** The order's money state as a small square tag; nothing while nothing is owed or paid. */
export function MoneyTag({ money }: { money: Pick<OrderMoney, "state"> }) {
  if (money.state === "none") return null;
  const s = MONEY_ADMIN[money.state];
  return <StatusTag tone={s.tone}>{s.label}</StatusTag>;
}

/** Owed, paid and left (or paid over), as a short definition list. */
export function MoneyFacts({ money }: { money: OrderMoney }) {
  const rows: [string, number, string?][] = [
    ["לתשלום", money.owed],
    ["שולם", money.paid],
  ];
  if (money.over > 0) rows.push(["שולם ביתר", money.over, "text-brand-strong"]);
  else rows.push(["נותר", money.left, money.left > 0 ? "text-warning font-semibold" : undefined]);
  return (
    <dl className="grid grid-cols-3 gap-x-4 text-sm">
      {rows.map(([label, value, tone]) => (
        <div key={label} className="flex flex-col">
          <dt className="text-caption text-muted">{label}</dt>
          <dd className={`tabular-nums ${tone ?? ""}`}>{formatIls(value, { agorot: true })}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Payments, newest first; a voided one stays, struck through, with its reason. */
export function PaymentList({ rows, showOrder = false, morningReceipt = false }: { rows: PaymentRow[]; showOrder?: boolean; morningReceipt?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted">עוד לא נרשמו תשלומים.</p>;
  return (
    <ul className="flex flex-col">
      {rows.map((p) => {
        const label = `תשלום ${formatIls(Number(p.amountIls), { agorot: true })} מ-${formatDay(new Date(`${p.paidAt}T12:00:00Z`))}`;
        return (
          <li key={p.id} className="flex flex-col gap-1 border-t border-line py-2 text-sm first:border-t-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`flex flex-wrap items-center gap-x-2 ${p.voidedAt ? "text-muted" : ""}`}>
                <span className={`font-medium tabular-nums ${p.voidedAt ? "line-through" : ""}`}>{formatIls(Number(p.amountIls), { agorot: true })}</span>
                <Ltr>{formatDay(new Date(`${p.paidAt}T12:00:00Z`))}</Ltr>
                <span>{METHOD_LABEL[p.method as PaymentMethod]}</span>
                {p.reference && (
                  <span>
                    אסמכתא <Ltr>{p.reference}</Ltr>
                  </span>
                )}
                {showOrder &&
                  (p.orderId && p.orderNumber ? (
                    <Link href={`/admin?open=${p.orderId}`} className="text-brand hover:underline">
                      הזמנה <Ltr>{p.orderNumber}</Ltr>
                    </Link>
                  ) : (
                    <span>על חשבון</span>
                  ))}
                {p.voidedAt && <StatusTag tone="neutral">בוטל</StatusTag>}
              </span>
              {!p.voidedAt && <VoidPayment paymentId={p.id} label={label} />}
            </div>
            {p.documentId && p.morningDocNo ? (
              // Issued by the site in Morning (P3): the number is the document's, not edited here.
              <span className="text-caption text-muted">
                חשבונית מס/קבלה <Ltr>{p.morningDocNo}</Ltr> בחשבונית ירוקה
              </span>
            ) : p.voidedAt ? (
              p.morningDocNo && (
                <span className="text-caption text-muted">
                  חשבונית מס/קבלה <Ltr>{p.morningDocNo}</Ltr>
                </span>
              )
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <PaymentDocNo paymentId={p.id} docNo={p.morningDocNo} />
                {morningReceipt && !p.morningDocNo && p.method !== "other" && <IssuePaymentDocument paymentId={p.id} cheque={p.method === "cheque"} />}
              </div>
            )}
            <span className="text-caption text-muted">
              נרשם על ידי <bdi>{p.createdBy}</bdi>
              {p.note && <>, {p.note}</>}
              {p.voidedAt && (
                <>
                  . בוטל{p.voidedBy && (
                    <>
                      {" "}על ידי <bdi>{p.voidedBy}</bdi>
                    </>
                  )}
                  : {p.voidReason}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
