"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { ActionState } from "@/components/action-form";
import { Alert, Button, Field, Input, Select } from "@/components/form";
import { showToast } from "@/components/toast";
import { METHOD_LABEL, PAYMENT_METHODS, defaultAmount } from "@/domain/payments";
import { formatIls } from "@/domain/pricing";
import { recordPayment, voidPayment } from "./actions";

/**
 * "רישום תשלום": a side sheet (a bottom sheet on phones) with the amount set to what is left,
 * today's date and a bank transfer, so the common case is one tap on "רישום".
 */
export function RecordPayment({
  teamId,
  orderId,
  left,
  today,
  title,
  primary = false,
}: {
  teamId: string;
  /** Null for a payment on account. */
  orderId: string | null;
  left: number;
  /** YYYY-MM-DD, Israel time. */
  today: string;
  /** "הזמנה 1071" or the team's name, for the sheet's heading. */
  title: string;
  /** The card's main button while the order is unpaid. */
  primary?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  // A new key per opening resets the fields to what is left now.
  const [opening, setOpening] = useState(0);
  const [state, action, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const result = await recordPayment(prev, data);
    if (result.ok) {
      dialog.current?.close();
      showToast(result.ok);
      router.refresh();
    }
    return result;
  }, {} as ActionState);

  return (
    <>
      <Button
        type="button"
        variant={primary ? "primary" : "secondary"}
        className="self-start"
        onClick={() => {
          setOpening((n) => n + 1);
          dialog.current?.showModal();
        }}
      >
        רישום תשלום
      </Button>
      <dialog ref={dialog} aria-labelledby={`pay-title-${orderId ?? teamId}`} className="sheet sheet-side">
        <form key={opening} action={action} className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={`pay-title-${orderId ?? teamId}`} className="text-section font-semibold">
                רישום תשלום
              </h2>
              <p className="text-caption text-muted">
                {title}
                {left > 0 && <>, נותרו {formatIls(left, { agorot: true })}</>}
              </p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="סגירה" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-subtle">
              <X size={20} aria-hidden />
            </button>
          </div>
          {state.error && <Alert>{state.error}</Alert>}
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="orderId" value={orderId ?? ""} />
          <Field label="סכום (ש״ח)" name={`amount-${opening}`}>
            <Input id={`amount-${opening}`} name="amount" inputMode="decimal" dir="ltr" required autoComplete="off" defaultValue={defaultAmount(left)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="תאריך התשלום" name={`paidAt-${opening}`}>
              <Input id={`paidAt-${opening}`} name="paidAt" type="date" lang="he-IL" required defaultValue={today} />
            </Field>
            <Field label="אמצעי תשלום" name={`method-${opening}`}>
              <Select id={`method-${opening}`} name="method" defaultValue="transfer">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="אסמכתא" name={`reference-${opening}`} hint="מספר העברה בבנק או מספר צ׳ק, לא חובה">
            <Input id={`reference-${opening}`} name="reference" dir="ltr" maxLength={100} autoComplete="off" />
          </Field>
          <Field label="הערה" name={`note-${opening}`}>
            <Input id={`note-${opening}`} name="note" maxLength={500} autoComplete="off" />
          </Field>
          <Button disabled={pending} className="self-start">
            {pending ? "רושם…" : "רישום"}
          </Button>
        </form>
      </dialog>
    </>
  );
}

/** "ביטול" on one payment: a typed reason, no confirm dialog. The payment stays on record, marked. */
export function VoidPayment({ paymentId, label }: { paymentId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const result = await voidPayment(prev, data);
    if (result.ok) {
      setOpen(false);
      showToast(result.ok);
      router.refresh();
    }
    return result;
  }, {} as ActionState);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 px-2 text-sm text-danger hover:underline" aria-label={`ביטול ${label}`}>
        ביטול
      </button>
    );
  return (
    <form action={action} className="flex w-full flex-col gap-2 rounded-xl bg-subtle p-3">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="paymentId" value={paymentId} />
      <input
        name="reason"
        required
        minLength={2}
        maxLength={500}
        autoFocus
        aria-label={`סיבת הביטול של ${label}`}
        placeholder="למה מבטלים? (למשל: נרשם פעמיים)"
        className="h-11 min-w-0 rounded-full border border-line bg-surface px-3 text-base"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" disabled={pending}>
          {pending ? "מבטל…" : "ביטול התשלום"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          השארה
        </Button>
      </div>
    </form>
  );
}
