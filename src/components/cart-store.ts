"use client";

import { useSyncExternalStore } from "react";

/** What the viewer can do with a cart. Only "ordering" has one. */
export type CartMode = "loading" | "guest" | "pending" | "readonly" | "admin" | "ordering";

export type CartSheetLine = {
  variantId: string;
  title: string;
  options: string;
  sku: string | null;
  image: string | null;
  href: string;
  supplierName: string;
  qty: number;
  unitPriceIls: number | null;
};

export type CartState = { mode: CartMode; lines: CartSheetLine[] };

/**
 * The cart lives in the database, per team. The server sends it with every
 * render (CartSync), and the search panel and stepper change it here first, so
 * the pill moves the moment you tap, before the server answers.
 */
let state: CartState = { mode: "loading", lines: [] };
const listeners = new Set<() => void>();

function set(next: CartState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot: CartState = { mode: "loading", lines: [] };

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, () => state, () => serverSnapshot);
}

/** Replaces the cart with what the server rendered. */
export function syncCart(next: CartState) {
  set(next);
}

/** Adds `qty` right away. `line` describes it when it isn't in the cart yet. */
export function addOptimistic(variantId: string, qty: number, line: Omit<CartSheetLine, "qty"> | null) {
  const existing = state.lines.find((l) => l.variantId === variantId);
  if (existing) {
    set({ ...state, lines: state.lines.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l)) });
  } else if (line) {
    set({ ...state, lines: [...state.lines, { ...line, qty }] });
  }
}

export function setQtyOptimistic(variantId: string, qty: number) {
  set({ ...state, lines: state.lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l)) });
}

/** Takes a line out right away and hands it back, for Undo. */
export function removeOptimistic(variantId: string): CartSheetLine | null {
  const line = state.lines.find((l) => l.variantId === variantId) ?? null;
  if (line) set({ ...state, lines: state.lines.filter((l) => l !== line) });
  return line;
}

export function cartTotals(lines: CartSheetLine[]) {
  return {
    count: lines.reduce((sum, l) => sum + l.qty, 0),
    totalIls: lines.reduce((sum, l) => sum + (l.unitPriceIls ?? 0) * l.qty, 0),
  };
}
