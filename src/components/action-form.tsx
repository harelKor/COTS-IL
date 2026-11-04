"use client";

import { useActionState, type ReactNode } from "react";
import { Alert } from "@/components/form";

export type ActionState = { error?: string };

/** A form whose server action can answer with an error, shown above the fields. */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className={className}>
      {state.error && <Alert>{state.error}</Alert>}
      {children}
    </form>
  );
}
