"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { changeQtyNow, removeNow } from "./cart-actions";

/** − qty + for a cart line. At 1 the minus removes the line, with Undo instead of a confirm. */
export function QtyStepper({ variantId, qty, label, size = "md" }: { variantId: string; qty: number; label: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-9" : "size-11";
  const button = `flex ${box} items-center justify-center rounded-full text-foreground transition-transform duration-150 active:scale-90`;
  return (
    <div className="flex items-center rounded-full bg-subtle" role="group" aria-label={`כמות: ${label}`}>
      <button
        type="button"
        className={button}
        onClick={() => (qty <= 1 ? removeNow(variantId) : changeQtyNow(variantId, qty - 1))}
        aria-label={qty <= 1 ? "הסרה מהסל" : "הפחתה"}
      >
        {qty <= 1 ? <Trash2 size={16} strokeWidth={1.75} aria-hidden /> : <Minus size={16} strokeWidth={2} aria-hidden />}
      </button>
      <span className="min-w-6 text-center text-[15px] font-medium tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button type="button" className={button} onClick={() => changeQtyNow(variantId, qty + 1)} aria-label="הוספה">
        <Plus size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
