"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/form";
import { decideQuote, type DecisionState } from "../actions";

export function QuoteDecision({ quoteId }: { quoteId: string }) {
  const [state, action, pending] = useActionState(decideQuote, {} as DecisionState);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand bg-surface p-4 print:hidden">
      <p className="text-sm">
        אישור ההצעה הוא התחייבות של הקבוצה לסכום הזה. התשלום מתבצע מחוץ לאתר, והספק הישראלי יזמין מהספקים רק לאחר האישור.
      </p>
      {state.error && <Alert>{state.error}</Alert>}
      <form action={action}>
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="decision" value="approve" />
        <Button disabled={pending}>אישור ההצעה</Button>
      </form>
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="decision" value="reject" />
        <input
          name="reason"
          aria-label="סיבת דחייה"
          placeholder="סיבה או שינוי מבוקש"
          maxLength={1000}
          className="h-10 min-w-48 flex-1 rounded-md border border-line bg-surface px-3 text-sm"
        />
        <Button variant="ghost" disabled={pending}>
          דחיית ההצעה
        </Button>
      </form>
    </div>
  );
}
