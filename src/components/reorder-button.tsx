"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { reorder, reorderAndSend } from "@/app/cart/actions";
import { cancelOrder } from "@/app/orders/actions";
import { replaceLines } from "./cart-store";
import { showToast } from "./toast";

/**
 * "Order again": one tap puts an earlier order's approved quantities back in the cart and
 * opens it. With `sendNow` (home, empty cart) the same tap sends the request, with Undo.
 */
export function ReorderButton({ orderId, sendNow = false, className = "" }: { orderId: string; sendNow?: boolean; className?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const send = async () => {
    const res = await reorderAndSend(orderId);
    if (res.error) {
      showToast(res.error, "error");
      if (res.lines) replaceLines(res.lines);
      window.dispatchEvent(new Event("cart:open"));
      return;
    }
    replaceLines([]);
    router.refresh();
    const newId = res.orderId!;
    showToast(`בקשה ${res.number} נשלחה${res.skipped ? `; ${res.skipped} פריטים כבר לא נמכרים` : ""}`, "default", {
      label: "ביטול",
      run: async () => {
        const undo = await cancelOrder(newId);
        showToast(undo.error ?? `בקשה ${res.number} בוטלה`, undo.error ? "error" : "default");
        router.refresh();
      },
    });
  };

  const add = async () => {
    const { added, skipped, error, lines } = await reorder(orderId);
    if (error) return showToast(error, "error");
    if (lines) replaceLines(lines);
    showToast(skipped > 0 ? `נוספו ${added} פריטים; ${skipped} כבר לא נמכרים` : `נוספו ${added} פריטים לסל`);
    if (added > 0) window.dispatchEvent(new Event("cart:open"));
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(sendNow ? send : add)}
      className={`flex min-h-11 items-center gap-2 rounded-full bg-subtle px-4 text-callout hover:bg-line/60 disabled:opacity-60 ${className}`}
    >
      <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
      {pending ? (sendNow ? "שולח…" : "מוסיף…") : sendNow ? "הזמנה חוזרת: שליחה" : "הזמנה חוזרת"}
    </button>
  );
}
