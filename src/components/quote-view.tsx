import type { ReactNode } from "react";
import { Ltr } from "@/components/ltr";
import { formatDateTime, QuoteTable, type OrderItem } from "@/components/orders";
import { PaymentTerms } from "@/components/payment-terms";
import { TeamName } from "@/components/team-name";
import type { LineFacts } from "@/domain/order-status";
import { formatIls } from "@/domain/pricing";
import { quoteChanges, quoteValidUntil, type QuotedLine } from "@/domain/quote-view";
import { business } from "@/lib/business";

const day = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" });
export const formatShortDate = (d: Date) => day.format(d);

type Quote = { id: string; version: number; sentAt: Date; shippingIls: number; notes: string | null; lines: (QuotedLine & { quoteId?: string })[] };

/** The business's details, shown on the printed quote only. Every value is hidden while null. */
function PrintHeader({ orderNumber, quote, team }: { orderNumber: number; quote: Quote; team: Parameters<typeof TeamName>[0]["team"] }) {
  const facts: [string, string | null][] = [
    ["ח.פ.", business.companyNumber],
    ["טלפון", business.phone],
    ["דוא״ל", business.email],
  ];
  return (
    <div className="hidden flex-col gap-2 border-b border-line pb-4 print:flex">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-section font-semibold">{business.legalName ?? <Ltr>COTS-IL</Ltr>}</p>
          <p className="text-caption">
            {facts
              .filter(([, v]) => v)
              .map(([label, v]) => (
                <span key={label} className="me-3">
                  {label} <Ltr>{v}</Ltr>
                </span>
              ))}
          </p>
        </div>
        <div className="text-end text-caption">
          <p className="text-section font-semibold">הצעת מחיר</p>
          <p>
            מס׳ <Ltr>{`${orderNumber}-${quote.version}`}</Ltr>, {formatShortDate(quote.sentAt)}
          </p>
        </div>
      </div>
      <p className="text-callout">
        לכבוד: <TeamName team={team} />
      </p>
    </div>
  );
}

/**
 * One quote view for the order page and the approve link (S8): what changed from the
 * request (or the previous version) and why, the lines, the totals, how long it holds and
 * the payment terms. Prints as the quote a school's procurement office needs.
 */
export function QuoteView({
  orderNumber,
  team,
  items,
  quote,
  previous,
  progress,
  linkExpiresAt,
  children,
}: {
  orderNumber: number;
  team: Parameters<typeof TeamName>[0]["team"];
  items: OrderItem[];
  quote: Quote;
  previous?: Quote;
  progress?: Map<string, LineFacts>;
  /** On /q/<token>: when the link stops working. */
  linkExpiresAt?: Date;
  /** The decision, or whatever the page puts under the quote. */
  children?: ReactNode;
}) {
  const changes = quoteChanges(items, quote.lines, previous?.lines);
  const validUntil = quoteValidUntil(quote.sentAt, business.quoteValidDays);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="quote-title">
      <PrintHeader orderNumber={orderNumber} quote={quote} team={team} />
      <h2 id="quote-title" className="font-semibold">
        הצעת מחיר, גרסה {quote.version}{" "}
        <span className="text-caption font-normal text-muted">
          <Ltr>{formatDateTime(quote.sentAt)}</Ltr>
        </span>
      </h2>

      {changes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-card border border-warning/30 bg-warning/5 p-4">
          <h3 className="text-callout font-semibold">{previous ? "שינויים מהגרסה הקודמת" : "שינויים מהבקשה"}</h3>
          <ul className="flex flex-col gap-2 text-callout">
            {changes.map((c) => (
              <li key={c.itemId}>
                <Ltr className="font-medium">{c.title}</Ltr>
                {c.supplierSku && (
                  <>
                    {", "}
                    <Ltr className="font-mono text-caption text-muted">{c.supplierSku}</Ltr>
                  </>
                )}
                {": "}
                {c.kind === "removed" ? (
                  <span className="font-medium text-warning">הוסר מההצעה</span>
                ) : (
                  <span>
                    {(c.kind === "qty" || c.kind === "qty_price") && (
                      <>
                        כמות <s className="text-muted">{c.qtyBefore}</s> ← <span className="font-medium">{c.qtyAfter}</span>
                      </>
                    )}
                    {c.kind === "qty_price" && ", "}
                    {(c.kind === "price" || c.kind === "qty_price") && (
                      <>
                        מחיר ליחידה <s className="text-muted">{formatIls(c.priceBefore)}</s> ← <span className="font-medium">{formatIls(c.priceAfter)}</span>
                      </>
                    )}
                  </span>
                )}
                {c.reason && <span className="block text-caption text-muted">הסיבה: {c.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <QuoteTable quote={quote} previous={previous} items={items} progress={progress} />

      <div className="flex flex-col gap-1 text-caption text-muted">
        {validUntil && <p>ההצעה בתוקף עד {formatShortDate(validUntil)}.</p>}
        {linkExpiresAt && <p className="print:hidden">אפשר לאשר מהקישור הזה עד {formatShortDate(linkExpiresAt)}.</p>}
        <PaymentTerms className="" />
      </div>
      {quote.notes && <p className="whitespace-pre-wrap text-callout">הערות הספק הישראלי: {quote.notes}</p>}
      {children}
    </section>
  );
}
