import Link from "next/link";
import { business } from "@/lib/business";

/**
 * At the point of decision (product Add, cart footer): adding and sending cost
 * nothing, and what the ₪ price covers.
 */
export function PriceNote() {
  return (
    <div className="flex flex-col gap-1 text-caption text-muted">
      <p>הוספה לסל ושליחת בקשה לא מחייבות תשלום. תקבלו הצעת מחיר לאישור.</p>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-brand hover:text-brand-strong">מה כלול במחיר?</summary>
        <p className="pb-2">
          המחיר הוא מחיר הספק בדולרים, כפול השער היציג של בנק ישראל, כפול 1.6, בשקלים וכולל מע״מ{business.priceIncludes ? ` ו${business.priceIncludes}` : ""}. משלוח בישראל מתומחר בהצעת המחיר.{" "}
          <Link href="/shipping" className="text-brand underline-offset-2 hover:underline">
            משלוח וזמני אספקה
          </Link>
        </p>
      </details>
    </div>
  );
}
