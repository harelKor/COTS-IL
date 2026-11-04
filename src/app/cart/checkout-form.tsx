"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/form";
import type { FormState } from "@/lib/validation";
import { submitOrder } from "./actions";

type Defaults = { address: string; contactName: string; contactPhone: string };

export function CheckoutForm({ defaults }: { defaults: Defaults }) {
  const [state, action, pending] = useActionState(submitOrder, {} as FormState);
  const values = state.values;
  const errors = state.fieldErrors;

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-semibold">שליחת בקשת הזמנה</h2>
      {state.error && <Alert>{state.error}</Alert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">מסירה</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="deliveryMethod" value="pickup" defaultChecked={values?.deliveryMethod !== "ship"} />
          איסוף עצמי
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="deliveryMethod" value="ship" defaultChecked={values?.deliveryMethod === "ship"} />
          משלוח לקבוצה
        </label>
        {errors?.deliveryMethod?.map((e) => (
          <p key={e} className="text-xs text-danger">
            {e}
          </p>
        ))}
      </fieldset>

      <Field label="כתובת למשלוח" name="address" errors={errors?.address} hint="נדרשת רק למשלוח">
        <Input name="address" defaultValue={values?.address ?? defaults.address} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="איש קשר" name="contactName" errors={errors?.contactName}>
          <Input name="contactName" required defaultValue={values?.contactName ?? defaults.contactName} />
        </Field>
        <Field label="טלפון" name="contactPhone" errors={errors?.contactPhone}>
          <Input name="contactPhone" dir="ltr" required defaultValue={values?.contactPhone ?? defaults.contactPhone} />
        </Field>
      </div>
      <Field label="הערות לספק הישראלי" name="notes" errors={errors?.notes}>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={values?.notes}
          className="rounded-md border border-line bg-surface px-3 py-2 text-base"
        />
      </Field>

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" className="mt-1" />
          <span>זו בקשה ולא הזמנה סופית. הספק הישראלי יבדוק זמינות ומחירים, יוסיף עלות משלוח וישלח הצעה לאישור הקבוצה.</span>
        </label>
        {errors?.confirm?.map((e) => (
          <p key={e} className="text-xs text-danger">
            {e}
          </p>
        ))}
      </div>

      <Button disabled={pending}>{pending ? "שולח…" : "שליחה לספק הישראלי"}</Button>
    </form>
  );
}
