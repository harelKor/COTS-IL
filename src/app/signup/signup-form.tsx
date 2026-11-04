"use client";

import { useActionState } from "react";
import { signup } from "@/app/auth/actions";
import { Alert, Button, Field, Input, Select } from "@/components/form";
import type { FormState } from "@/lib/validation";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, {} as FormState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      {state.error && <Alert>{state.error}</Alert>}

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-3 font-semibold">פרטי הקבוצה</legend>
        <Field label="תחום" name="program" errors={e.program}>
          <Select name="program" defaultValue={v.program ?? "FRC"} required>
            <option value="FRC">FRC</option>
            <option value="FTC">FTC</option>
          </Select>
        </Field>
        <Field label="מספר קבוצה" name="teamNumber" errors={e.teamNumber}>
          <Input name="teamNumber" inputMode="numeric" dir="ltr" required defaultValue={v.teamNumber} />
        </Field>
        <Field label="שם הקבוצה" name="teamName" errors={e.teamName}>
          <Input name="teamName" required defaultValue={v.teamName} />
        </Field>
        <div className="sm:col-span-3">
          <Field label="כתובת למשלוח" name="address" errors={e.address} hint="אפשר להשאיר ריק אם תאספו בעצמכם">
            <Input name="address" defaultValue={v.address} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">איש קשר (מנהל הקבוצה באתר)</legend>
        <Field label="שם מלא" name="fullName" errors={e.fullName}>
          <Input name="fullName" autoComplete="name" required defaultValue={v.fullName} />
        </Field>
        <Field label="טלפון" name="phone" errors={e.phone}>
          <Input name="phone" type="tel" dir="ltr" autoComplete="tel" required defaultValue={v.phone} />
        </Field>
        <Field label="דוא״ל" name="email" errors={e.email}>
          <Input name="email" type="email" dir="ltr" autoComplete="email" required defaultValue={v.email} />
        </Field>
        <Field label="סיסמה" name="password" errors={e.password} hint="לפחות 8 תווים">
          <Input name="password" type="password" dir="ltr" autoComplete="new-password" required minLength={8} />
        </Field>
      </fieldset>

      <Button disabled={pending} className="self-start">
        {pending ? "שולח…" : "שליחת בקשת הרשמה"}
      </Button>
    </form>
  );
}
