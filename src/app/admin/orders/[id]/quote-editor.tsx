"use client";

import { useActionState, useState } from "react";
import { Ellipsis, ImageOff, RefreshCw } from "lucide-react";
import { Alert, Field, Input } from "@/components/form";
import { Availability } from "@/components/availability";
import { ItemDescription } from "@/components/orders";
import { formatIls } from "@/domain/pricing";
import { quoteSummary } from "@/domain/quote-summary";
import { shopifyImage } from "@/lib/images";
import { rejectOrder, sendQuote, type QuoteFormState } from "../actions";

export type EditorLine = {
  id: string;
  title: string;
  supplierName: string;
  supplierSku: string | null;
  options: { name: string; value: string }[];
  productUrl: string;
  image: string | null;
  requestedQty: number;
  requestedPrice: number;
  qty: number;
  unitPriceIls: number;
  changeReason: string;
  /** Today's catalog price (USD × rate), to compare with what the team saw. */
  livePriceIls: number | null;
  liveAvailable: boolean | null;
  /** When the last sync checked this variant (ISO). */
  checkedAt: string | null;
};

type Values = { qty: string; price: string; reason: string };

const inputClass = "h-11 rounded-full border border-line bg-surface px-3 text-base";

function Thumb({ src }: { src: string | null }) {
  if (!src) {
    return (
      <span className="tile-fade flex size-14 shrink-0 items-center justify-center rounded-xl text-muted" aria-hidden>
        <ImageOff size={20} />
      </span>
    );
  }
  return (
    <span className="tile-fade flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...shopifyImage(src, 56)} alt="" width={56} height={56} loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
    </span>
  );
}

function signed(n: number) {
  if (n === 0) return "ללא שינוי";
  return `${n > 0 ? "+" : "−"}${formatIls(Math.abs(n))}`;
}

export function QuoteEditor(props: {
  orderId: string;
  lines: EditorLine[];
  shippingIls: number | null;
  notes: string;
  version: number;
  /** From the admin's settings (פרטי העסק); null hides the line. */
  paymentTerms: string | null;
}) {
  const [state, action, pending] = useActionState(sendQuote, {} as QuoteFormState);
  const [values, setValues] = useState<Record<string, Values>>(() =>
    Object.fromEntries(props.lines.map((l) => [l.id, { qty: String(l.qty), price: String(l.unitPriceIls), reason: l.changeReason }])),
  );
  const [shipping, setShipping] = useState(props.shippingIls === null ? "" : String(props.shippingIls));
  const set = (id: string, change: Partial<Values>) => setValues((v) => ({ ...v, [id]: { ...v[id], ...change } }));

  const summary = quoteSummary(
    props.lines.map((l) => ({ ...l, qty: Number(values[l.id].qty), unitPriceIls: Number(values[l.id].price) })),
    shipping === "" ? null : Number(shipping),
  );

  return (
    <form action={action} className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-4">
      <h2 className="font-semibold">{props.version > 1 ? `טיוטת הצעה, גרסה ${props.version}` : "טיוטת הצעה"}</h2>
      {state.sent && (
        <Alert tone="info">
          {state.emailed
            ? "ההצעה שמורה, והיא נשלחת עכשיו בדוא״ל לכל כתובת בחשבון הקבוצה, כל אחת עם קישור אישור משלה."
            : "ההצעה שמורה ומחכה לאישור הקבוצה. דוא״ל לא מוגדר, אז לא נשלח כלום: שלחו לקבוצה את קישורי האישור בוואטסאפ."}
        </Alert>
      )}
      <input type="hidden" name="orderId" value={props.orderId} />

      <ul className="flex flex-col">
        {props.lines.map((line) => {
          const v = values[line.id];
          const live = line.livePriceIls;
          return (
            <li key={line.id} className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
              <div className="flex items-start gap-3">
                <Thumb src={line.image} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <ItemDescription item={line} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                    <span className="text-muted">
                      ביקשו: {line.requestedQty} × {formatIls(line.requestedPrice)}
                    </span>
                    {line.checkedAt && <Availability available={line.liveAvailable} checkedAt={line.checkedAt} />}
                    <a href={line.productUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                      עמוד הספק
                    </a>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-caption">
                  כמות
                  <input name={`qty:${line.id}`} type="number" min={0} inputMode="numeric" value={v.qty} onChange={(e) => set(line.id, { qty: e.target.value })} className={`${inputClass} w-20`} />
                </label>
                <label className="flex items-center gap-1 text-caption">
                  מחיר ליחידה ₪
                  <input name={`price:${line.id}`} type="number" min={0} inputMode="numeric" value={v.price} onChange={(e) => set(line.id, { price: e.target.value })} className={`${inputClass} w-24`} />
                </label>
                {live !== null && String(live) !== v.price && (
                  <button
                    type="button"
                    onClick={() => set(line.id, { price: String(live), reason: v.reason || (live !== line.requestedPrice ? "מחיר מעודכן אצל הספק" : "") })}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full bg-subtle px-3 text-caption font-medium text-brand-strong hover:bg-subtle-hover"
                  >
                    <RefreshCw size={16} aria-hidden />
                    רענון מחיר ({formatIls(live)})
                  </button>
                )}
                <input
                  name={`reason:${line.id}`}
                  aria-label="סיבת השינוי"
                  placeholder="סיבת השינוי (חובה אם שונה מהבקשה)"
                  value={v.reason}
                  onChange={(e) => set(line.id, { reason: e.target.value })}
                  maxLength={500}
                  className={`${inputClass} min-w-0 flex-1 basis-48`}
                />
              </div>
              {state.lineErrors?.[line.id] && <p className="text-caption text-danger">{state.lineErrors[line.id]}</p>}
            </li>
          );
        })}
      </ul>

      <Field label="משלוח בישראל ₪" name="shippingIls" hint="0 לאיסוף עצמי">
        <Input name="shippingIls" type="number" min={0} inputMode="numeric" required value={shipping} onChange={(e) => setShipping(e.target.value)} />
      </Field>
      <Field label="הערות לקבוצה" name="notes">
        <textarea id="notes" name="notes" rows={2} maxLength={2000} defaultValue={props.notes} className="rounded-xl border border-line bg-surface px-3 py-2 text-base" />
      </Field>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-subtle p-3 text-sm" aria-live="polite">
        <dt>סכום הפריטים</dt>
        <dd className="text-end tabular-nums">{formatIls(summary.subtotal)}</dd>
        <dt>משלוח</dt>
        <dd className="text-end tabular-nums">{shipping === "" ? "עוד לא מולא" : formatIls(summary.shipping)}</dd>
        <dt className="font-semibold">סה״כ לתשלום</dt>
        <dd className="text-end font-semibold tabular-nums">{formatIls(summary.total)}</dd>
        <dt className="text-muted">לעומת הבקשה ({formatIls(summary.requested)}, בלי משלוח)</dt>
        <dd className={`text-end tabular-nums ${summary.difference > 0 ? "text-warning" : "text-muted"}`}>{signed(summary.difference)}</dd>
      </dl>

      {props.paymentTerms && <p className="text-caption text-muted">תנאי תשלום (מופיע בהצעה): {props.paymentTerms}</p>}
      {state.error && <Alert>{state.error}</Alert>}
      <button disabled={pending} className="btn-brand min-h-11 self-start rounded-full px-6 font-medium disabled:opacity-60">
        {pending ? "שולח…" : "שליחת ההצעה לקבוצה"}
      </button>
    </form>
  );
}

/** "…" next to the order: rejecting is rare and final, so it isn't a button beside Send. */
export function OrderMenu({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(rejectOrder, {} as QuoteFormState);
  return (
    <details className="group relative self-end">
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full hover:bg-subtle [&::-webkit-details-marker]:hidden" aria-label="פעולות נוספות">
        <Ellipsis size={20} aria-hidden />
      </summary>
      <form action={action} className="absolute end-0 z-10 mt-1 flex w-[min(20rem,calc(100vw-3rem))] flex-col gap-2 rounded-[18px] border border-line bg-surface p-3 shadow-lift">
        {state.error && <Alert>{state.error}</Alert>}
        <input type="hidden" name="orderId" value={orderId} />
        <label className="flex flex-col gap-1 text-sm">
          דחיית ההזמנה
          <input name="reason" placeholder="סיבת הדחייה (הקבוצה תראה אותה)" required minLength={2} maxLength={1000} className={inputClass} />
        </label>
        <button disabled={pending} className="min-h-11 rounded-full bg-subtle px-4 text-sm font-medium text-danger hover:bg-subtle-hover disabled:opacity-60">
          {pending ? "דוחה…" : "דחיית ההזמנה"}
        </button>
      </form>
    </details>
  );
}
