"use client";

import { Check, MessageSquare, RotateCcw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { decideQuote, undoDecision, type Decision } from "@/app/orders/actions";
import { UNDO_SECONDS } from "@/domain/quote-view";
import { Alert, Button } from "./form";

/** Seconds left from `at` (an ISO time) until the undo window closes, ticking each second. */
export function useCountdown(at: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [at]);
  if (!at) return 0;
  return Math.max(0, Math.ceil(UNDO_SECONDS - (now - new Date(at).getTime()) / 1000));
}

const DONE_TEXT: Record<"approve" | "reject", string> = {
  approve: "ההצעה אושרה. הספק הישראלי יזמין מהספקים.",
  reject: "ההצעה נדחתה.",
};

/**
 * The team's three answers to a quote (S8): approve, ask for a change (the order stays
 * open), or reject. After approve or reject, "ביטול" undoes it for 30 seconds. Opening the
 * page never decides anything: mail scanners open links too.
 */
export function QuoteDecision({
  quoteId,
  token,
  decided,
}: {
  quoteId: string;
  /** Set on /q/<token>: the answer is recorded against the email the link was made for. */
  token?: string;
  /** A decision made in the last 30 s, from the server, so a re-render keeps the Undo. */
  decided?: { action: "approve" | "reject"; at: string } | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "change" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [local, setLocal] = useState<{ action: Decision; at: string } | null>(null);
  const done = local ?? decided ?? null;
  const left = useCountdown(done && done.action !== "change" ? done.at : null);

  const run = (decision: Decision) =>
    start(async () => {
      setError(null);
      const res = await decideQuote({ quoteId, token, decision, reason });
      if (res.error) return setError(res.error);
      setLocal({ action: decision, at: new Date().toISOString() });
      setMode("idle");
    });

  const undo = () =>
    start(async () => {
      const res = await undoDecision({ quoteId, token });
      if (res.error) return setError(res.error);
      setLocal(null);
      setReason("");
    });

  if (done?.action === "change") {
    return (
      <div role="status" className="flex items-start gap-2 card-surface p-4 text-callout print:hidden">
        <MessageSquare size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <span>בקשת השינוי נשלחה לספק הישראלי. ההזמנה נשארת פתוחה, ותקבלו גרסה מעודכנת של ההצעה.</span>
      </div>
    );
  }

  if (done) {
    return (
      <div role="status" className={`flex flex-col gap-3 card-surface p-4 print:hidden ${done.action === "approve" ? "ring-2 ring-success" : ""}`}>
        <p className={`flex items-center gap-2 font-semibold ${done.action === "approve" ? "text-success" : ""}`}>
          {done.action === "approve" && <Check size={20} aria-hidden />}
          {DONE_TEXT[done.action]}
        </p>
        {error && <Alert>{error}</Alert>}
        {left > 0 && (
          <Button variant="secondary" onClick={undo} disabled={pending} className="self-start">
            <RotateCcw size={16} aria-hidden /> ביטול (<span suppressHydrationWarning>{left}</span>)
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 card-surface p-4 ring-2 ring-brand print:hidden">
      <p className="text-callout">
        אישור ההצעה הוא התחייבות של הקבוצה לסכום הזה. התשלום מתבצע מחוץ לאתר, והספק הישראלי יזמין מהספקים רק לאחר האישור.
      </p>
      {error && <Alert>{error}</Alert>}
      <Button onClick={() => run("approve")} disabled={pending} className="w-full sm:w-auto sm:self-start">
        {pending && mode === "idle" ? "מאשר…" : "אישור ההצעה"}
      </Button>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setMode("change")} disabled={pending}>
            בקשת שינוי
          </Button>
          <Button variant="ghost" onClick={() => setMode("reject")} disabled={pending}>
            דחיית ההצעה
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(mode);
          }}
        >
          <label htmlFor="decision-reason" className="text-callout font-medium">
            {mode === "change" ? "מה לשנות? (ההזמנה נשארת פתוחה)" : "סיבת הדחייה (לא חובה). ההזמנה תיסגר."}
          </label>
          <textarea
            id="decision-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required={mode === "change"}
            maxLength={1000}
            rows={3}
            autoFocus
            className="min-h-11 rounded-xl bg-subtle p-3 text-callout"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={mode === "reject" ? "danger" : "secondary"} disabled={pending}>
              {mode === "change" ? "שליחת בקשת השינוי" : "דחיית ההצעה"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")} disabled={pending}>
              חזרה
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
