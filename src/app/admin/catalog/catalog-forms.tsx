"use client";

import { useActionState, useTransition, type ReactNode } from "react";
import { showToast } from "@/components/toast";
import { removeOverride, restoreOverride, type ActionResult } from "./actions";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** A form for one override that says when it's saved (the catalog regroups, ~10 s). */
export function OverrideForm({ action, children, className, label = "שמירה" }: { action: FormAction; children: ReactNode; className?: string; label?: string }) {
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    showToast(result.ok ? "נשמר, הקטלוג עודכן" : result.error, result.ok ? "default" : "error");
    return result;
  }, null);
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full border border-line bg-surface px-5 text-sm font-medium hover:bg-subtle disabled:opacity-60">
          {pending ? "מעדכן את הקטלוג…" : label}
        </button>
        {state && !state.ok && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

/** "הסרה" with an Undo toast instead of a confirm dialog. */
export function RemoveOverrideButton({ kind, id }: { kind: "product" | "variant"; id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const removed = await removeOverride(kind, id);
          if (!removed) return;
          showToast("התיקון הוסר", "default", { label: "ביטול", run: () => void restoreOverride(removed) });
        })
      }
      className="min-h-11 rounded-full px-4 text-sm text-muted hover:bg-subtle hover:text-danger disabled:opacity-60"
    >
      {pending ? "מסיר…" : "הסרה"}
    </button>
  );
}
