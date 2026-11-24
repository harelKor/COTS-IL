"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { ActionState } from "@/components/action-form";
import { Alert, Button, Field, Input, Select } from "@/components/form";
import { showToast } from "@/components/toast";
import { METHOD_LABEL, PAYMENT_METHODS, defaultAmount } from "@/domain/payments";
import { formatIls } from "@/domain/pricing";
import { recordPayment, setPaymentDocNo, setQuoteMorningNumbers, voidPayment } from "./actions";

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
  morningReceipt = false,
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
  /** P3: Morning is connected and its receipt step is on, so the sheet offers to issue the חשבונית מס/קבלה. */
  morningReceipt?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  // A new key per opening resets the fields to what is left now.
  const [opening, setOpening] = useState(0);
  const [method, setMethod] = useState("transfer");
  const [issue, setIssue] = useState(true);
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
          setMethod("transfer");
          setIssue(true);
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
              <Select id={`method-${opening}`} name="method" defaultValue="transfer" onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="אסמכתא" name={`reference-${opening}`} hint="מספר העברה בבנק או מספר צ׳ק, לא חובה">
              <Input id={`reference-${opening}`} name="reference" dir="ltr" maxLength={100} autoComplete="off" />
            </Field>
            {!(morningReceipt && issue) && (
              <Field label="מס׳ חשבונית מס/קבלה" name={`morningDocNo-${opening}`} hint="מחשבונית ירוקה, לא חובה; אפשר גם אחר כך">
                <Input id={`morningDocNo-${opening}`} name="morningDocNo" inputMode="numeric" dir="ltr" maxLength={20} autoComplete="off" />
              </Field>
            )}
          </div>
          {morningReceipt && (
            <div className="flex flex-col gap-3 rounded-xl bg-subtle p-3">
              <label className="flex min-h-11 items-center gap-3 text-callout">
                <input type="checkbox" name="issueDocument" checked={issue} onChange={(e) => setIssue(e.target.checked)} className="size-5 accent-brand" />
                הפקת חשבונית מס/קבלה בחשבונית ירוקה
              </label>
              {issue && method === "other" && <p className="text-caption text-muted">לתשלום ״אחר״ אין סוג מתאים בחשבונית ירוקה: התשלום יירשם בלי חשבונית.</p>}
              {issue && method === "cheque" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="בנק" name={`bankName-${opening}`} hint="מספר או שם">
                    <Input id={`bankName-${opening}`} name="bankName" maxLength={40} autoComplete="off" required />
                  </Field>
                  <Field label="סניף" name={`bankBranch-${opening}`}>
                    <Input id={`bankBranch-${opening}`} name="bankBranch" inputMode="numeric" dir="ltr" maxLength={10} autoComplete="off" required />
                  </Field>
                  <Field label="חשבון" name={`bankAccount-${opening}`}>
                    <Input id={`bankAccount-${opening}`} name="bankAccount" inputMode="numeric" dir="ltr" maxLength={20} autoComplete="off" required />
                  </Field>
                </div>
              )}
            </div>
          )}
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

type NumberField = { name: string; label: string; value: string | null };

/**
 * Morning numbers typed by hand, shown as one line with "עריכה" that turns it into small
 * fields in place. Digits only, checked on the server; an empty field clears the number.
 */
function InlineNumbers({
  title,
  hidden,
  fields,
  save,
}: {
  title: string;
  hidden: Record<string, string>;
  fields: NumberField[];
  save: (prev: ActionState, data: FormData) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const result = await save(prev, data);
    if (result.ok) {
      setEditing(false);
      showToast(result.ok);
      router.refresh();
    }
    return result;
  }, {} as ActionState);
  const shown = fields.filter((f) => f.value);
  if (!editing)
    return (
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="text-muted">{title}:</span>
        {shown.length ? (
          shown.map((f, i) => (
            <span key={f.name}>
              {f.label}{" "}
              <bdi dir="ltr" className="tabular-nums">
                {f.value}
              </bdi>
              {i < shown.length - 1 ? "," : ""}
            </span>
          ))
        ) : (
          <span className="text-muted">עוד לא הוזן</span>
        )}
        <button type="button" onClick={() => setEditing(true)} className="min-h-11 px-2 text-brand hover:underline" aria-label={`עריכת ${title}`}>
          עריכה
        </button>
      </div>
    );
  return (
    <form action={action} className="flex w-full flex-col gap-2 rounded-xl bg-subtle p-3">
      <span className="text-sm font-medium">{title}</span>
      {state.error && <Alert>{state.error}</Alert>}
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="flex flex-wrap gap-3">
        {fields.map((f) => (
          <label key={f.name} className="flex min-w-40 flex-1 flex-col gap-1 text-caption">
            {f.label}
            <input
              name={f.name}
              defaultValue={f.value ?? ""}
              inputMode="numeric"
              dir="ltr"
              maxLength={20}
              autoComplete="off"
              className="h-11 rounded-xl border border-line bg-surface px-3 text-base"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          ביטול
        </Button>
      </div>
    </form>
  );
}

/** The order card's "חשבונית ירוקה" row under the quote: its הצעת מחיר and חשבון עסקה numbers. */
export function QuoteMorningNumbers({ quoteId, quoteNo, dealNo }: { quoteId: string; quoteNo: string | null; dealNo: string | null }) {
  return (
    <InlineNumbers
      title="חשבונית ירוקה"
      hidden={{ quoteId }}
      fields={[
        { name: "morningQuoteNo", label: "הצעת מחיר", value: quoteNo },
        { name: "morningDealNo", label: "חשבון עסקה", value: dealNo },
      ]}
      save={setQuoteMorningNumbers}
    />
  );
}

/** A payment's חשבונית מס/קבלה number, added or corrected after it was recorded. */
export function PaymentDocNo({ paymentId, docNo }: { paymentId: string; docNo: string | null }) {
  return (
    <InlineNumbers
      title="חשבונית ירוקה"
      hidden={{ paymentId }}
      fields={[{ name: "morningDocNo", label: "חשבונית מס/קבלה", value: docNo }]}
      save={setPaymentDocNo}
    />
  );
}
