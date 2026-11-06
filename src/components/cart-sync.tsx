"use client";

import { useEffect } from "react";
import { mergeCart } from "@/app/cart/actions";
import { clearGuestCart, readGuestCart, syncCart, type CartState } from "./cart-store";
import { showToast } from "./toast";

/**
 * Hands the server-rendered cart to the client store. Renders nothing. When a
 * guest who built a cart signs in, that cart joins the team's.
 */
export function CartSync({ cart }: { cart: CartState }) {
  useEffect(() => {
    syncCart(cart);
    if (cart.mode !== "ordering") return;
    const guest = readGuestCart();
    if (guest.length === 0) return;
    clearGuestCart();
    void mergeCart(guest.map((l) => ({ variantId: l.variantId, qty: l.qty }))).then(({ added }) => {
      if (added > 0) showToast(`הסל שבניתם לפני הכניסה נוסף לסל הקבוצה (${added})`);
    });
  }, [cart]);
  return null;
}
