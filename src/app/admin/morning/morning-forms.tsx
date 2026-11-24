"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { Alert, Button, Field, Input } from "@/components/form";
import { showToast } from "@/components/toast";
import type { MorningSteps } from "@/domain/morning";
import { formatIls } from "@/domain/pricing";
import { issueCredit, issuePaymentDocument, saveMorningSteps, testMorning } from "./actions";

type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

/** Runs a Morning action, then a toast and a refresh; an error stays above the form. */
function useMorningAction(action: Action, onOk?: () => void) {
  const router = useRouter();
  return useActionState(async (prev: ActionState, data: FormData) => {
    const result = await action(prev, data);
    if (result.ok) {
      showToast(result.ok);
      onOk?.();
      router.refresh();
    } else if (result.error) showToast(result.error, "error");
    return result;
  }, {} as ActionState);
}

/** One button that sends hidden fields to a Morning action: "הפקת חשבון עסקה", "ניסיון חוזר", "קישור". */
export function MorningButton({
  action,
  fields,
  label,
  pendingLabel = "שולח לחשבונית ירוקה…",
  variant = "secondary",
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [, run, pending] = useMorningAction(action);
  return (
    <form action={run}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button variant={variant} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
    </form>
  );
}

/** "הפקת חשבונית" for a payment without one; a cheque asks for its bank details first. */
export function IssuePaymentDocument({ paymentId, cheque }: { paymentId: string; cheque: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useMorningAction(issuePaymentDocument, () => setOpen(false));
  if (!cheque) return <MorningButton action={issuePaymentDocument} fields={{ paymentId }} label="הפקת חשבונית מס/קבלה" variant="ghost" />;
  if (!open)
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        הפקת חשבונית מס/קבלה
      </Button>
    );
  return (
    <form action={run} className="flex w-full flex-col gap-2 rounded-xl bg-subtle p-3">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="paymentId" value={paymentId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="בנק" name={`bank-${paymentId}`}>
          <Input id={`bank-${paymentId}`} name="bankName" required maxLength={40} />
        </Field>
        <Field label="סניף" name={`branch-${paymentId}`}>
          <Input id={`branch-${paymentId}`} name="bankBranch" required inputMode="numeric" dir="ltr" maxLength={10} />
        </Field>
        <Field label="חשבון" name={`account-${paymentId}`}>
          <Input id={`account-${paymentId}`} name="bankAccount" required inputMode="numeric" dir="ltr" maxLength={20} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending}>{pending ? "שולח לחשבונית ירוקה…" : "הפקה"}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          סגירה
        </Button>
      </div>
    </form>
  );
}

/** "הפקת זיכוי": the amount (all that is left by default) and a reason. */
export function CreditForm({ documentId, remaining, label }: { documentId: string; remaining: number; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useMorningAction(issueCredit, () => setOpen(false));
  if (!open)
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} aria-label={`הפקת זיכוי ל${label}`}>
        הפקת זיכוי
      </Button>
    );
  return (
    <form action={run} className="flex w-full flex-col gap-2 rounded-xl bg-subtle p-3">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="documentId" value={documentId} />
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Field label="סכום הזיכוי (ש״ח)" name={`credit-amount-${documentId}`} hint={`עד ${formatIls(remaining, { agorot: true })}`}>
          <Input id={`credit-amount-${documentId}`} name="amount" inputMode="decimal" dir="ltr" required defaultValue={String(remaining)} />
        </Field>
        <Field label="סיבה" name={`credit-reason-${documentId}`} hint="מופיעה בחשבונית הזיכוי">
          <Input id={`credit-reason-${documentId}`} name="reason" required minLength={2} maxLength={300} placeholder="למשל: ההזמנה בוטלה" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" disabled={pending}>
          {pending ? "שולח לחשבונית ירוקה…" : "הפקת חשבונית זיכוי"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          סגירה
        </Button>
      </div>
    </form>
  );
}

/** "בדיקת חיבור". */
export function TestMorningButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      className="self-start"
      onClick={() =>
        start(async () => {
          const r = await testMorning();
          showToast(r.ok ?? r.error ?? "", r.ok ? "default" : "error");
          router.refresh();
        })
      }
    >
      {pending ? "בודק…" : "בדיקת חיבור"}
    </Button>
  );
}

const STEPS: { key: keyof MorningSteps; label: string }[] = [
  { key: "quote", label: "הצעת מחיר כשנשלחת הצעה" },
  { key: "deal", label: "חשבון עסקה כשהקבוצה מאשרת" },
  { key: "receipt", label: "חשבונית מס/קבלה ברישום תשלום (תיבה מסומנת)" },
  { key: "credit", label: "״הפקת זיכוי״ בכרטיס ההזמנה" },
];

/** Which documents the site issues by itself. */
export function MorningStepsForm({ steps }: { steps: MorningSteps }) {
  const [state, run, pending] = useMorningAction(saveMorningSteps);
  return (
    <form action={run} className="flex flex-col gap-1">
      <fieldset className="flex flex-col">
        <legend className="text-callout font-semibold">מה האתר מפיק לבד</legend>
        {STEPS.map((s) => (
          <label key={s.key} className="flex min-h-11 items-center gap-3 text-callout">
            <input type="checkbox" name={s.key} defaultChecked={steps[s.key]} className="size-5 accent-brand" />
            {s.label}
          </label>
        ))}
      </fieldset>
      {state.error && <Alert>{state.error}</Alert>}
      <Button variant="secondary" disabled={pending} className="self-start">
        {pending ? "שומר…" : "שמירה"}
      </Button>
    </form>
  );
}
