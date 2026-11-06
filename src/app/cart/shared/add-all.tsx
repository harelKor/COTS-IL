"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { addToCartNow, type AddableLine } from "@/components/cart-actions";
import { canEditCart, useCart } from "@/components/cart-store";
import { showToast } from "@/components/toast";

/** One tap: every part of the shared cart into this viewer's cart (a guest's or the team's). */
export function AddAll({ lines }: { lines: (AddableLine & { qty: number })[] }) {
  const { mode } = useCart();
  const [done, setDone] = useState(false);
  if (!canEditCart(mode)) return null;
  return (
    <button
      type="button"
      disabled={done}
      onClick={() => {
        for (const { qty, ...line } of lines) addToCartNow(line, qty);
        setDone(true);
        showToast(`נוספו ${lines.length} פריטים לסל`);
      }}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 font-medium text-white hover:bg-brand-strong disabled:bg-success"
    >
      {done ? (
        <>
          <Check size={18} aria-hidden /> נוסף לסל
        </>
      ) : (
        `הוספת כל ${lines.length} הפריטים לסל`
      )}
    </button>
  );
}
