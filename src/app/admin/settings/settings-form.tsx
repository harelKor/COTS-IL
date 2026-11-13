"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/form";
import { showToast } from "@/components/toast";
import type { SettingsResult } from "./actions";

type FormAction = (prev: SettingsResult | null, formData: FormData) => Promise<SettingsResult>;

/** A settings form that says when it's saved, or what's wrong, by toast and next to its button. */
export function SettingsForm({
  action,
  children,
  label = "שמירה",
  pendingLabel = "שומר…",
  className = "flex flex-col gap-4",
  primary = true,
}: {
  action: FormAction;
  children: ReactNode;
  label?: string;
  pendingLabel?: string;
  className?: string;
  primary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(async (prev: SettingsResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    showToast(result.ok ? (result.message ?? "נשמר") : result.error, result.ok ? "default" : "error");
    return result;
  }, null);
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={primary ? "primary" : "secondary"} disabled={pending}>
          {pending ? pendingLabel : label}
        </Button>
        <p role="status" aria-live="polite" className={`text-callout ${state && !state.ok ? "text-danger" : "text-success"}`}>
          {state ? (state.ok ? (state.message ?? "נשמר") : state.error) : ""}
        </p>
      </div>
    </form>
  );
}
