"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/form";
import { inviteMember, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, {} as InviteState);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.link && (
        <div className="flex flex-col gap-1 rounded-md border border-success p-3 text-sm">
          <span>
            שלחו את הקישור לכתובת שהוספתם. הוא תקף לשבועיים, עובד רק עם הכתובת הזאת, ומוצג כאן רק פעם אחת.
          </span>
          <input
            dir="ltr"
            readOnly
            value={state.link}
            aria-label="קישור הזמנה"
            onFocus={(e) => e.currentTarget.select()}
            className="h-9 rounded-md border border-line bg-subtle px-2 font-mono text-xs"
          />
        </div>
      )}
      <Field label="דוא״ל" name="email">
        <Input name="email" type="email" dir="ltr" required />
      </Field>
      <Button disabled={pending} className="self-start">
        הוספת כתובת
      </Button>
    </form>
  );
}
