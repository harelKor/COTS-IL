"use client";

import { useActionState } from "react";
import { addToCart, type AddToCartState } from "@/app/cart/actions";

export function AddToCart({ variantId }: { variantId: string }) {
  const [state, action, pending] = useActionState(addToCart, {} as AddToCartState);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <input
        name="qty"
        type="number"
        min={1}
        max={9999}
        defaultValue={1}
        aria-label="כמות"
        className="h-9 w-16 rounded-md border border-line bg-surface px-2 text-sm"
      />
      <button
        disabled={pending}
        className="h-9 whitespace-nowrap rounded-md bg-brand px-3 text-sm text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "מוסיף…" : "הוספה לסל"}
      </button>
      {state.added && !pending && <span className="text-xs text-success">נוסף</span>}
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
