"use client";

import { useEffect } from "react";
import { syncCart, type CartState } from "./cart-store";

/** Hands the server-rendered cart to the client store. Renders nothing. */
export function CartSync({ cart }: { cart: CartState }) {
  useEffect(() => {
    syncCart(cart);
  }, [cart]);
  return null;
}
