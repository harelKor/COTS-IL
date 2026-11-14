"use client";

import Link from "next/link";
import { formatMarkup, markupText } from "@/domain/pricing";
import { useSiteFacts } from "./site-facts";

/** "2026-11-10" → "10/11/2026". */
const dayOf = (isoDate: string) => isoDate.split("-").reverse().join("/");

/** How the ₪ price is made: USD at the Bank of Israel rate, × the multiplier, no VAT; shipping in the quote. */
function HowPriced({ rateDate, times }: { rateDate?: string; times: string }) {
  const { priceIncludes } = useSiteFacts();
  return (
    <p className="pb-2">
      המחיר הוא מחיר הספק בדולרים לפי השער היציג של בנק ישראל
      {rateDate ? (
        <>
          {" "}מ-<bdi dir="ltr">{dayOf(rateDate)}</bdi>
        </>
      ) : (
        " (מתעדכן כל יום)"
      )}
      , כפול <bdi dir="ltr">{times}</bdi>
      {priceIncludes ? `, כולל ${priceIncludes}` : ""}. משלוח בישראל מתומחר בהצעת המחיר.{" "}
      <Link href="/shipping" className="text-brand underline-offset-2 hover:underline">
        משלוח וזמני אספקה
      </Link>
    </p>
  );
}

/**
 * At the point of decision (product Add, cart footer): adding and sending cost
 * nothing, and how the ₪ price is made (USD × rate × the multiplier, no VAT). `markup` is the
 * chosen part's; without one it's the admin's range ("1.4 עד 1.6") or the one multiplier.
 * `inline` puts the "not binding" line and "איך נקבע המחיר?" on one row, for the cart's compact footer.
 */
export function PriceNote({ rateDate, markup, inline = false }: { rateDate?: string; markup?: number | null; inline?: boolean }) {
  const { markupRange } = useSiteFacts();
  const times = markup ? formatMarkup(markup) : markupText(markupRange);
  if (inline) {
    return (
      <details className="group text-caption text-muted">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
          <span>לא מחייב: תקבלו הצעת מחיר לאישור.</span>
          <span className="shrink-0 text-brand group-hover:text-brand-strong">איך נקבע המחיר?</span>
        </summary>
        <HowPriced rateDate={rateDate} times={times} />
      </details>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-caption text-muted">
      <p>הוספה לסל ושליחת בקשה לא מחייבות תשלום. תקבלו הצעת מחיר לאישור.</p>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-brand hover:text-brand-strong">איך נקבע המחיר?</summary>
        <HowPriced rateDate={rateDate} times={times} />
      </details>
    </div>
  );
}
