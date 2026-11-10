"use client";

import { useEffect, useRef } from "react";
import { mergeCart } from "@/app/cart/actions";
import { maxMerge } from "@/domain/cart";
import {
  clearGuestCart,
  readGuestCart,
  replaceLines,
  setMergeSkipped,
  syncCart,
  writeEnded,
  writeStarted,
  type CartState,
} from "./cart-store";
import { showToast } from "./toast";

/**
 * Hands the server-rendered cart to the client store. Renders nothing. When a
 * guest who built a cart signs in, that cart joins the team's: both show at
 * once, and the browser's copy is cleared only after the server confirms, so
 * a failed merge loses nothing and is tried again on the next page.
 */
export function CartSync({ cart }: { cart: CartState }) {
  const merging = useRef(false);

  useEffect(() => {
    const guest = cart.mode === "ordering" && !merging.current ? readGuestCart() : [];
    if (guest.length === 0) {
      syncCart(cart);
      return;
    }

    // Show the team's lines and the guest's together while the server merges (no "empty cart" flash).
    const changes = new Map(maxMerge(cart.lines, guest).map((c) => [c.variantId, c.qty]));
    const shown = [
      ...cart.lines.map((l) => (changes.has(l.variantId) ? { ...l, qty: changes.get(l.variantId)! } : l)),
      ...guest.filter((g) => !cart.lines.some((l) => l.variantId === g.variantId)),
    ];
    syncCart({ ...cart, lines: shown });

    merging.current = true;
    writeStarted();
    mergeCart(guest.map((l) => ({ variantId: l.variantId, qty: l.qty })))
      .then((result) => {
        if (result.error || !result.lines) throw new Error(result.error);
        clearGuestCart();
        replaceLines(result.lines);
        setMergeSkipped(result.skipped);
        if (result.added > 0) showToast(`הסל שבניתם לפני הכניסה נוסף לסל הקבוצה (${result.added})`);
      })
      .catch(() => {
        replaceLines(cart.lines);
        showToast("לא הצלחנו לצרף את הסל שבניתם לפני הכניסה. ננסה שוב בדף הבא.", "error");
      })
      .finally(() => {
        writeEnded();
        merging.current = false;
      });
  }, [cart]);
  return null;
}
