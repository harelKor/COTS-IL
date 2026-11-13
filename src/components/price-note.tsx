"use client";

import Link from "next/link";
import { formatMarkup, markupText } from "@/domain/pricing";
import { useSiteFacts } from "./site-facts";

/** "2026-11-10" → "10/11/2026". */
const dayOf = (isoDate: string) => isoDate.split("-").reverse().join("/");

/**
 * At the point of decision (product Add, cart footer): adding and sending cost
 * nothing, and how the ₪ price is made (USD × rate × the multiplier, no VAT). `markup` is the
 * chosen part's; without one it's the admin's range ("1.4 עד 1.6") or the one multiplier.
 */
export function PriceNote({ rateDate, markup }: { rateDate?: string; markup?: number | null }) {
  const { priceIncludes, markupRange } = useSiteFacts();
  const times = markup ? formatMarkup(markup) : markupText(markupRange);
  return (
    <div className="flex flex-col gap-1 text-caption text-muted">
      <p>הוספה לסל ושליחת בקשה לא מחייבות תשלום. תקבלו הצעת מחיר לאישור.</p>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-brand hover:text-brand-strong">איך נקבע המחיר?</summary>
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
      </details>
    </div>
  );
}
