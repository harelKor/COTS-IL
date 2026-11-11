"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/form";
import { useCountdown } from "@/components/quote-decision";
import { cancelOrder, undoCancel } from "../actions";

/**
 * "ביטול ההזמנה" with no confirm dialog: one tap cancels, and "החזרת ההזמנה" brings it
 * back for 30 seconds (S8). `cancelledAt` comes from the server so a re-render keeps it.
 */
export function CancelOrder({ orderId, cancelledAt }: { orderId: string; cancelledAt: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const at = local ?? cancelledAt;
  const left = useCountdown(at);

  if (at) {
    return (
      <div role="status" className="flex w-full flex-col gap-2 card-surface p-4">
        <p className="font-semibold">ההזמנה בוטלה.</p>
        {error && <Alert>{error}</Alert>}
        {left > 0 && (
          <Button
            variant="secondary"
            className="self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await undoCancel(orderId);
                if (res.error) return setError(res.error);
                setLocal(null);
              })
            }
          >
            <RotateCcw size={16} aria-hidden /> החזרת ההזמנה (<span suppressHydrationWarning>{left}</span>)
          </Button>
        )}
      </div>
    );
  }
  return (
    <>
      {error && <Alert>{error}</Alert>}
      <Button
        variant="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await cancelOrder(orderId);
            if (res.error) return setError(res.error);
            setLocal(new Date().toISOString());
          })
        }
      >
        ביטול ההזמנה
      </Button>
    </>
  );
}
