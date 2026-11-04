"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/form";
import { ROLE_LABELS } from "@/domain/teams";
import { inviteMember, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, {} as InviteState);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.link && (
        <div className="flex flex-col gap-1 rounded-md border border-success p-3 text-sm">
          <span>
            שלחו את הקישור למוזמן. הוא תקף לשבועיים, עובד רק עם הדוא״ל שהוזמן, ומוצג כאן רק פעם אחת.
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
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="דוא״ל" name="email">
          <Input name="email" type="email" dir="ltr" required />
        </Field>
        <Field label="הרשאה" name="role">
          <Select name="role" defaultValue="buyer">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button disabled={pending} className="self-start">
        יצירת קישור הזמנה
      </Button>
    </form>
  );
}
