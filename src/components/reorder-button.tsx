"use client";

import { RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { reorder } from "@/app/cart/actions";
import { showToast } from "./toast";

/** "Order again": one tap puts an earlier order's parts back in the cart and opens it. */
export function ReorderButton({ orderId, className = "" }: { orderId: string; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { added, skipped, error } = await reorder(orderId);
          if (error) return showToast(error, "error");
          showToast(skipped > 0 ? `נוספו ${added} פריטים; ${skipped} כבר לא נמכרים` : `נוספו ${added} פריטים לסל`);
          if (added > 0) window.dispatchEvent(new Event("cart:open"));
        })
      }
      className={`flex min-h-11 items-center gap-2 rounded-full bg-subtle px-4 text-[15px] hover:bg-line/60 disabled:opacity-60 ${className}`}
    >
      <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
      {pending ? "מוסיף…" : "הזמנה חוזרת"}
    </button>
  );
}
