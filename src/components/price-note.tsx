import Link from "next/link";
import { business } from "@/lib/business";

/** "2026-11-10" → "10/11/2026". */
const dayOf = (isoDate: string) => isoDate.split("-").reverse().join("/");

/**
 * At the point of decision (product Add, cart footer): adding and sending cost
 * nothing, and how the ₪ price is made (USD × rate × 1.6, no VAT).
 */
export function PriceNote({ rateDate }: { rateDate?: string }) {
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
          , כפול 1.6
          {business.priceIncludes ? `, כולל ${business.priceIncludes}` : ""}. משלוח בישראל מתומחר בהצעת המחיר.{" "}
          <Link href="/shipping" className="text-brand underline-offset-2 hover:underline">
            משלוח וזמני אספקה
          </Link>
        </p>
      </details>
    </div>
  );
}
