"use client";

import { quickAdd, removeFromCart, setCartQty } from "@/app/cart/actions";
import {
  addOptimistic,
  applyServerLine,
  cartSnapshot,
  findLine,
  removeOptimistic,
  setQtyOptimistic,
  writeEnded,
  writeStarted,
  type CartSheetLine,
} from "./cart-store";
import { showToast } from "./toast";
import { track } from "@vercel/analytics";

/**
 * Cart changes from anywhere on the page: the store moves first, so the pill and
 * steppers answer within a frame, then the server answers with the changed line
 * (no page re-render). A failed write goes back and says so. A guest's cart stays in the browser, so it skips the
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
  // The floating pill on phones, the header's cart button where the pill is hidden.
  const target = [...document.querySelectorAll("[data-cart-pill], [data-cart-button]")].map((el) => el.getBoundingClientRect()).find((r) => r.width > 0);
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

/**
 * Each line's latest local change. A server answer only lands when no newer
 * change to that line was made after it was sent; otherwise it's stale.
 */
const versions = new Map<string, number>();
const bump = (variantId: string) => {
  const v = (versions.get(variantId) ?? 0) + 1;
  versions.set(variantId, v);
  return v;
};
const isLatest = (variantId: string, v: number) => versions.get(variantId) === v;

/** Runs a server write, counted so a server render that lands meanwhile can't undo local taps. */
const inFlight = new Set<Promise<unknown>>();

function write<T>(run: () => Promise<T>): Promise<T | { error: string }> {
  writeStarted();
  const p = run()
    .catch(() => ({ error: "אין חיבור לשרת. השינוי לא נשמר." }))
    .finally(() => {
      writeEnded();
      inFlight.delete(p);
    });
  inFlight.add(p);
  return p;
}

/** Per-line debounce for quantity writes: five fast taps send one request. */
const QTY_DEBOUNCE_MS = 300;
const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; confirmed: number; fire: () => void }>();

/** Sends every waiting quantity change now and waits for all cart writes, so a send sees the cart as shown. */
export async function flushCartWrites() {
  for (const { timer, fire } of [...timers.values()]) {
    clearTimeout(timer);
    fire();
  }
  await Promise.all([...inFlight]);
}

function cancelQtyWrite(variantId: string) {
  const pending = timers.get(variantId);
  if (!pending) return;
  clearTimeout(pending.timer);
  timers.delete(variantId);
  writeEnded();
}

export function addToCartNow(line: AddableLine, qty = 1, from?: Element | null) {
  const before = findLine(line.variantId);
  track("add_to_cart");
  addOptimistic(line.variantId, qty, line);
  haptic();
  flyToCart(from ?? null);
  if (!onServer()) return;
  const v = bump(line.variantId);
  void write(() => quickAdd(line.variantId, qty)).then((result) => {
    if (!isLatest(line.variantId, v)) return;
    if (result.error) {
      applyServerLine(line.variantId, before);
      showToast(result.error, "error");
    } else if ("line" in result && result.line !== undefined) applyServerLine(line.variantId, result.line);
  });
}

export function changeQtyNow(variantId: string, qty: number) {
  if (qty < 1 || qty > 9999) return;
  const current = findLine(variantId);
  if (!current) return;
  setQtyOptimistic(variantId, qty);
  haptic();
  if (!onServer()) return;

  // The quantity the server last confirmed, to go back to if the write fails.
  const pending = timers.get(variantId);
  const confirmed = pending ? pending.confirmed : current.qty;
  if (pending) clearTimeout(pending.timer);
  else writeStarted();
  const v = bump(variantId);
  const fire = () => {
    timers.delete(variantId);
    void write(() => setCartQty(variantId, qty))
      .then((result) => {
        if (!isLatest(variantId, v)) return;
        if (result.error) {
          if ("line" in result && result.line === null) applyServerLine(variantId, null);
          else setQtyOptimistic(variantId, confirmed);
          showToast(result.error, "error");
        } else if ("line" in result && result.line !== undefined) applyServerLine(variantId, result.line);
      })
      .finally(writeEnded);
  };
  timers.set(variantId, { timer: setTimeout(fire, QTY_DEBOUNCE_MS), confirmed, fire });
}

/** Puts a removed line back (Undo), at the quantity it had. */
export function restoreLine(line: CartSheetLine) {
  const { qty, ...rest } = line;
  addToCartNow(rest, qty);
}

/**
 * Removes a line at once and offers Undo: in a toast, or (`undo: "inline"`) left to the
 * caller, which shows it in place, as the cart sheet does. Returns the removed line.
 */
export function removeNow(variantId: string, { undo = "toast" }: { undo?: "toast" | "inline" } = {}): CartSheetLine | null {
  cancelQtyWrite(variantId);
  const line = removeOptimistic(variantId);
  if (!line) return null;
  haptic();
  if (onServer()) {
    const v = bump(variantId);
    void write(() => removeFromCart(variantId)).then((result) => {
      if (result.error && isLatest(variantId, v)) {
        applyServerLine(variantId, line);
        showToast(result.error, "error");
      }
    });
  }
  if (undo === "toast") showToast("הוסר מהסל", "default", { label: "ביטול", run: () => restoreLine(line) });
  return line;
}
