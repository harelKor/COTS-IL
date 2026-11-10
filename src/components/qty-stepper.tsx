"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { clampQty } from "@/domain/cart";
import { changeQtyNow, removeNow } from "./cart-actions";

/**
 * − qty + for a cart line. At 1 the minus removes the line, with Undo instead of
 * a confirm. In the cart ("md") the number is a field: type 40 and press Enter
 * instead of tapping 39 times. On catalog cards ("sm") it's just the number.
 */
export function QtyStepper({ variantId, qty, label, size = "md" }: { variantId: string; qty: number; label: string; size?: "sm" | "md" }) {
  const [draft, setDraft] = useState<string | null>(null);
  const button = "flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-transform duration-150 active:scale-90";

  function commit() {
    if (draft === null) return;
    const value = Number(draft.replace(/[^\d]/g, ""));
    setDraft(null);
    if (!draft.trim() || !Number.isFinite(value)) return;
    if (value === 0) return removeNow(variantId);
    const next = clampQty(value);
    if (next !== qty) changeQtyNow(variantId, next);
  }

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
      {size === "md" ? (
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          aria-label="כמות"
          value={draft ?? String(qty)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value.slice(0, 5))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
          className="h-11 w-12 bg-transparent text-center text-[15px] font-medium tabular-nums outline-none focus:rounded-lg focus:bg-surface focus:ring-2 focus:ring-brand"
        />
      ) : (
        <span className="min-w-6 text-center text-[15px] font-medium tabular-nums" aria-live="polite">
          {qty}
        </span>
      )}
      <button type="button" className={button} onClick={() => changeQtyNow(variantId, qty + 1)} disabled={qty >= 9999} aria-label="הוספה">
        <Plus size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
