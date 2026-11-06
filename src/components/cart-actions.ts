"use client";

import { quickAdd, removeFromCart, setCartQty } from "@/app/cart/actions";
import { addOptimistic, cartSnapshot, removeOptimistic, setQtyOptimistic, type CartSheetLine } from "./cart-store";
import { showToast } from "./toast";

/**
 * Cart changes from anywhere on the page: the store moves first, so the pill and
 * steppers answer within a frame, then the server catches up and its render
 * replaces the store. A guest's cart stays in the browser, so it skips the
 * server. Nothing here asks for confirmation; removals offer Undo.
 */

const onServer = () => cartSnapshot().mode === "ordering";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A light tap on phones that support it. iPhones don't, and simply skip it. */
function haptic() {
  if (!reducedMotion()) navigator.vibrate?.(8);
}

/** Flies a copy of the product photo from `from` into the cart pill. */
function flyToCart(from: Element | null) {
  if (!from || reducedMotion()) return;
  const start = from.getBoundingClientRect();
  const target = document.querySelector("[data-cart-pill]")?.getBoundingClientRect();
  const endX = target ? target.left + target.width / 2 : window.innerWidth / 2;
  const endY = target ? target.top + target.height / 2 : window.innerHeight - 40;
  const size = Math.min(start.width, start.height, 96);
  const ghost = document.createElement("div");
  const img = from instanceof HTMLImageElement ? from : from.querySelector("img");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${start.left + start.width / 2 - size / 2}px`,
    top: `${start.top + start.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "999px",
    background: img ? `#f5f5f7 url("${img.currentSrc || img.src}") center/contain no-repeat` : "var(--brand)",
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.18)",
    zIndex: "60",
    pointerEvents: "none",
  });
  document.body.appendChild(ghost);
  const dx = endX - (start.left + start.width / 2);
  const dy = endY - (start.top + start.height / 2);
  ghost
    .animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.6 },
      ],
      { duration: 450, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    )
    .finished.finally(() => ghost.remove());
}

export type AddableLine = Omit<CartSheetLine, "qty">;

export function addToCartNow(line: AddableLine, qty = 1, from?: Element | null) {
  addOptimistic(line.variantId, qty, line);
  haptic();
  flyToCart(from ?? null);
  if (onServer()) {
    void quickAdd(line.variantId, qty).then(({ error }) => {
      if (error) showToast(error, "error");
    });
  }
}

export function changeQtyNow(variantId: string, qty: number) {
  if (qty < 1 || qty > 9999) return;
  setQtyOptimistic(variantId, qty);
  haptic();
  if (onServer()) void setCartQty(variantId, qty);
}

/** Removes a line at once and offers Undo for 5 seconds. */
export function removeNow(variantId: string) {
  const line = removeOptimistic(variantId);
  if (!line) return;
  haptic();
  if (onServer()) void removeFromCart(variantId);
  showToast("הוסר מהסל", "default", {
    label: "ביטול",
    run: () => {
      const { qty, ...rest } = line;
      addOptimistic(line.variantId, qty, rest);
      if (onServer()) void quickAdd(line.variantId, qty);
    },
  });
}
