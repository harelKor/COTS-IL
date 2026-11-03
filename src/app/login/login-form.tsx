"use client";

import { useActionState } from "react";
import { login } from "@/app/auth/actions";
import { Alert, Button, Field, Input } from "@/components/form";
import type { FormState } from "@/lib/validation";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(login, {} as FormState);

  return (
    <form action={action} className="flex flex-col gap-4">
      {notice && !state.error && <Alert tone="info">{notice}</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="דוא״ל" name="email" errors={state.fieldErrors?.email}>
        <Input name="email" type="email" dir="ltr" autoComplete="email" required defaultValue={state.values?.email} />
      </Field>
      <Field label="סיסמה" name="password" errors={state.fieldErrors?.password}>
        <Input name="password" type="password" dir="ltr" autoComplete="current-password" required />
      </Field>
      <Button disabled={pending}>{pending ? "מתחבר…" : "כניסה"}</Button>
    </form>
  );
}
