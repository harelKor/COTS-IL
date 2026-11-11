"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { approveQuoteByLink, type LinkApprovalState } from "@/app/orders/actions";

/** The one tap that approves. Opening the link alone never does: mail scanners open links too. */
export function ApproveForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(async () => approveQuoteByLink(token), {} as LinkApprovalState);
  if (state.approved) {
    return (
      <div className="flex items-center gap-2 rounded-card bg-success/10 p-4 font-semibold text-success">
        <Check size={20} aria-hidden /> ההצעה אושרה. הספק הישראלי יזמין מהספקים.
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <p className="text-caption text-danger">{state.error}</p>}
      <button
        disabled={pending}
        className="flex h-12 w-full items-center justify-center rounded-full bg-brand text-body font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "מאשר…" : "אישור ההצעה"}
      </button>
    </form>
  );
}
