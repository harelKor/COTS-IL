"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/form";
import { showToast } from "@/components/toast";
import { cancelPo, recordOrdered, removePoLine, restorePoLine, updatePoRecord, type PoFormState } from "../actions";

export type PoRecord = {
  supplierOrderRef: string | null;
  shippingUsd: string | null;
  taxUsd: string | null;
  totalChargedUsd: string | null;
  cardLabel: string | null;
  tracking: string | null;
};

/** The charge, card and tracking fields, shared by recording and correcting an order. */
function ChargeFields({ record }: { record?: PoRecord }) {
  const money = (name: keyof PoRecord, label: string) => (
    <Field label={label} name={name}>
      <Input name={name} type="number" min={0} step="0.01" dir="ltr" inputMode="decimal" defaultValue={record?.[name] ?? ""} />
    </Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {money("shippingUsd", "משלוח בארה״ב, בדולר")}
      {money("taxUsd", "מס, בדולר")}
      {money("totalChargedUsd", "סה״כ חויב, בדולר")}
      <Field label="כרטיס (כינוי וארבע ספרות)" name="cardLabel">
        <Input name="cardLabel" maxLength={40} placeholder="ויזה 1234" defaultValue={record?.cardLabel ?? ""} />
      </Field>
      <Field label="מספר מעקב" name="tracking">
        <Input name="tracking" dir="ltr" maxLength={100} defaultValue={record?.tracking ?? ""} />
      </Field>
    </div>
  );
}

type CostLine = { id: string; label: string; cost: string | null };

export function RecordOrderedForm({ poId, lines, today }: { poId: string; lines: CostLine[]; today: string }) {
  const [state, action, pending] = useActionState(recordOrdered, {} as PoFormState);
  // The supplier's order number comes first: the button waits for it (S13).
  const [ref, setRef] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 print:hidden">
      <h2 className="font-semibold">רישום הזמנה שבוצעה באתר הספק</h2>
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="poId" value={poId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="מספר הזמנה אצל הספק" name="supplierOrderRef">
          <Input name="supplierOrderRef" dir="ltr" required maxLength={100} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        <Field label="תאריך ההזמנה" name="orderedAt">
          <Input name="orderedAt" type="date" lang="he-IL" required defaultValue={today} />
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
      <ChargeFields />
      <Field label="הערות" name="notes">
        <Input name="notes" maxLength={2000} />
      </Field>
      <Button disabled={pending || ref.trim() === ""}>{pending ? "שומר…" : "סימון כהוזמן מהספק"}</Button>
      {ref.trim() === "" && <p className="text-caption text-muted">קודם ממלאים את מספר ההזמנה אצל הספק.</p>}
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

/** Corrects a placed order's record after the fact. */
export function PoRecordForm({ poId, record }: { poId: string; record: PoRecord }) {
  const [state, action, pending] = useActionState(updatePoRecord, {} as PoFormState);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 print:hidden">
      <h2 className="font-semibold">פרטי ההזמנה אצל הספק</h2>
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="info">נשמר.</Alert>}
      <input type="hidden" name="poId" value={poId} />
      <Field label="מספר הזמנה אצל הספק" name="supplierOrderRef">
        <Input name="supplierOrderRef" dir="ltr" required maxLength={100} defaultValue={record.supplierOrderRef ?? ""} />
      </Field>
      <ChargeFields record={record} />
      <Button variant="ghost" disabled={pending}>
        {pending ? "שומר…" : "שמירת הפרטים"}
      </Button>
    </form>
  );
}

/** Takes a line off a draft, with Undo in the toast instead of a confirm dialog. */
export function RemoveLineButton({ lineId, label }: { lineId: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`הסרת ${label} מהטיוטה`}
      className="min-h-11 rounded-full px-3 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
      onClick={() =>
        start(async () => {
          const result = await removePoLine(lineId);
          if (result.error || !result.undoId) return showToast(result.error ?? "ההסרה נכשלה", "error");
          const undoId = result.undoId;
          showToast("השורה הוסרה מהטיוטה", "default", {
            label: "החזרה",
            run: () =>
              start(async () => {
                const undone = await restorePoLine(undoId);
                if (undone.error) showToast(undone.error, "error");
              }),
          });
        })
      }
    >
      הסרה
    </button>
  );
}
