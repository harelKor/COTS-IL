"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/form";
import { cancelPo, recordOrdered, type PoFormState } from "../actions";

type CostLine = { id: string; label: string; cost: string | null };

export function RecordOrderedForm({ poId, lines, today }: { poId: string; lines: CostLine[]; today: string }) {
  const [state, action, pending] = useActionState(recordOrdered, {} as PoFormState);

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 print:hidden">
      <h2 className="font-semibold">רישום הזמנה שבוצעה באתר הספק</h2>
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="poId" value={poId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="מספר הזמנה אצל הספק" name="supplierOrderRef">
          <Input name="supplierOrderRef" dir="ltr" required maxLength={100} />
        </Field>
        <Field label="תאריך ההזמנה" name="orderedAt">
          <Input name="orderedAt" type="date" required defaultValue={today} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">מחיר ששולם ליחידה, בדולר</legend>
        {lines.map((line) => (
          <label key={line.id} className="flex items-center justify-between gap-3 text-sm">
            <span dir="ltr" className="min-w-0 text-start">
              {line.label}
            </span>
            <input
              name={`cost:${line.id}`}
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={line.cost ?? ""}
              className="h-9 w-24 shrink-0 rounded-md border border-line bg-surface px-2 text-sm"
            />
          </label>
        ))}
      </fieldset>
      <Field label="הערות" name="notes">
        <Input name="notes" maxLength={2000} />
      </Field>
      <Button disabled={pending}>{pending ? "שומר…" : "סימון כהוזמן"}</Button>
    </form>
  );
}

export function CancelPoForm({ poId, needsReason }: { poId: string; needsReason: boolean }) {
  const [state, action, pending] = useActionState(cancelPo, {} as PoFormState);

  return (
    <form action={action} className="flex flex-col gap-2 print:hidden">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="poId" value={poId} />
      <div className="flex flex-wrap gap-2">
        {needsReason && (
          <input
            name="reason"
            aria-label="סיבת ביטול"
            placeholder="סיבת הביטול"
            required
            maxLength={500}
            className="h-10 min-w-48 flex-1 rounded-md border border-line bg-surface px-3 text-sm"
          />
        )}
        <Button variant="ghost" disabled={pending}>
          ביטול ההזמנה והחזרת השורות לרכש
        </Button>
      </div>
    </form>
  );
}
