"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/form";
import { ItemDescription } from "@/components/orders";
import { formatIls } from "@/domain/pricing";
import { rejectOrder, sendQuote, type QuoteFormState } from "../actions";

export type EditorLine = {
  id: string;
  title: string;
  supplierName: string;
  supplierSku: string | null;
  options: { name: string; value: string }[];
  productUrl: string;
  requestedQty: number;
  requestedPrice: number;
  qty: number;
  unitPriceIls: number;
  changeReason: string;
  /** Today's catalog price (USD × rate), to compare with what the team saw. */
  livePriceIls: number | null;
  liveAvailable: boolean | null;
};

function LiveCheck({ line }: { line: EditorLine }) {
  const live = line.livePriceIls;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
      <span className="text-muted">ביקשו: {line.requestedQty} × {formatIls(line.requestedPrice)}</span>
      {live !== null && live !== line.requestedPrice && <span className="text-warning">בקטלוג כעת: {formatIls(live)}</span>}
      {line.liveAvailable === false && <span className="text-warning">לא זמין אצל הספק לפי הסנכרון האחרון</span>}
      <a href={line.productUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
        עמוד הספק
      </a>
    </div>
  );
}

export function QuoteEditor(props: {
  orderId: string;
  lines: EditorLine[];
  shippingIls: number | null;
  notes: string;
  version: number;
}) {
  const [state, action, pending] = useActionState(sendQuote, {} as QuoteFormState);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="font-semibold">הצעה סופית, גרסה {props.version}</h2>
      {state.sent && <Alert tone="info">ההצעה נשלחה לקבוצה.</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="orderId" value={props.orderId} />

      <ul className="flex flex-col">
        {props.lines.map((line) => (
          <li key={line.id} className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
            <ItemDescription item={line} />
            <LiveCheck line={line} />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs">
                כמות
                <input
                  name={`qty:${line.id}`}
                  type="number"
                  min={0}
                  defaultValue={line.qty}
                  className="h-9 w-20 rounded-md border border-line bg-surface px-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-1 text-xs">
                מחיר ליחידה ₪
                <input
                  name={`price:${line.id}`}
                  type="number"
                  min={0}
                  defaultValue={line.unitPriceIls}
                  className="h-9 w-24 rounded-md border border-line bg-surface px-2 text-sm"
                />
              </label>
              <input
                name={`reason:${line.id}`}
                aria-label="סיבת השינוי"
                placeholder="סיבת השינוי (חובה אם שונה מהבקשה)"
                defaultValue={line.changeReason}
                maxLength={500}
                className="h-9 min-w-48 flex-1 rounded-md border border-line bg-surface px-2 text-sm"
              />
            </div>
            {state.lineErrors?.[line.id] && <p className="text-xs text-danger">{state.lineErrors[line.id]}</p>}
          </li>
        ))}
      </ul>

      <Field label="משלוח בישראל ₪" name="shippingIls" hint="0 לאיסוף עצמי">
        <Input name="shippingIls" type="number" min={0} required defaultValue={props.shippingIls ?? undefined} />
      </Field>
      <Field label="הערות לקבוצה" name="notes">
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={props.notes}
          className="rounded-md border border-line bg-surface px-3 py-2 text-base"
        />
      </Field>
      <Button disabled={pending}>{pending ? "שולח…" : "שליחת ההצעה לקבוצה"}</Button>
    </form>
  );
}

export function RejectOrderForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(rejectOrder, {} as QuoteFormState);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap gap-2">
        <input
          name="reason"
          aria-label="סיבת דחייה"
          placeholder="סיבת דחיית ההזמנה"
          required
          maxLength={1000}
          className="h-10 min-w-48 flex-1 rounded-md border border-line bg-surface px-3 text-sm"
        />
        <Button variant="ghost" disabled={pending}>
          דחיית ההזמנה
        </Button>
      </div>
    </form>
  );
}
