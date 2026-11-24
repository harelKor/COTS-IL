"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { Alert, Button, Field, Input } from "@/components/form";
import { showToast } from "@/components/toast";

type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

export type BillingValues = { billingName: string | null; billingTaxId: string | null; billingEmail: string | null; billingAddress: string | null };

/** "פרטי חיוב": who the documents are made out to. Shared by /team and the admin's team page. */
export function BillingForm({ action, values, teamId, placeholders }: { action: Action; values: BillingValues; teamId?: string; placeholders: { name: string; email: string } }) {
  const router = useRouter();
  const [state, run, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const result = await action(prev, data);
    if (result.ok) {
      showToast(result.ok);
      router.refresh();
    }
    return result;
  }, {} as ActionState);
  const id = teamId ?? "own";
  return (
    <form action={run} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      {teamId && <input type="hidden" name="teamId" value={teamId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="שם לחשבונית" name={`billingName-${id}`} hint="בית הספר, העמותה או הקבוצה">
          <Input id={`billingName-${id}`} name="billingName" maxLength={120} defaultValue={values.billingName ?? ""} placeholder={placeholders.name} autoComplete="organization" />
        </Field>
        <Field label="ח.פ., עמותה או סמל מוסד" name={`billingTaxId-${id}`}>
          <Input id={`billingTaxId-${id}`} name="billingTaxId" inputMode="numeric" dir="ltr" maxLength={20} defaultValue={values.billingTaxId ?? ""} autoComplete="off" />
        </Field>
        <Field label="מייל לחשבוניות" name={`billingEmail-${id}`} hint="לשם נשלחים המסמכים">
          <Input id={`billingEmail-${id}`} name="billingEmail" type="email" dir="ltr" maxLength={200} defaultValue={values.billingEmail ?? ""} placeholder={placeholders.email} autoComplete="email" />
        </Field>
        <Field label="כתובת לחשבונית" name={`billingAddress-${id}`}>
          <Input id={`billingAddress-${id}`} name="billingAddress" maxLength={200} defaultValue={values.billingAddress ?? ""} autoComplete="street-address" />
        </Field>
      </div>
      <Button variant="secondary" disabled={pending} className="self-start">
        {pending ? "שומר…" : "שמירת פרטי החיוב"}
      </Button>
    </form>
  );
}
