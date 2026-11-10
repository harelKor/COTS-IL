"use client";

import { useSyncExternalStore } from "react";

/**
 * What the viewer can do with a cart. "guest" keeps one in the browser until
 * sign-in; "noteam" is signed in without a team yet; "ordering" has the team's.
 */
export type CartMode = "loading" | "guest" | "noteam" | "pending" | "admin" | "ordering";

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

export type Checkout = {
  deliveryMethod: "pickup" | "ship";
  address: string;
  contactName: string;
  contactPhone: string;
};

export type CartTeam = {
  name: string;
  program: "FRC" | "FTC";
  number: number;
  status: "pending" | "active" | "rejected" | "suspended";
};

export type CartState = { mode: CartMode; lines: CartSheetLine[]; team?: CartTeam; checkout?: Checkout; googleSignIn?: boolean };

/**
 * The team's cart lives in the database. The server sends it with every render
 * (CartSync), and the catalog and the sheet change it here first, so the pill
 * moves the moment you tap, before the server answers. A guest's cart lives
 * only here, saved in the browser.
 */
let state: CartState = { mode: "loading", lines: [] };
const listeners = new Set<() => void>();
const GUEST_KEY = "cots-il:guest-cart";

function saveGuestCart(lines: CartSheetLine[]) {
  try {
    if (lines.length) localStorage.setItem(GUEST_KEY, JSON.stringify(lines));
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    // Private windows can refuse storage; the cart still works until the tab closes.
  }
}

/** The cart a guest built before signing in, if any. */
export function readGuestCart(): CartSheetLine[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    const lines = raw ? (JSON.parse(raw) as CartSheetLine[]) : [];
    return Array.isArray(lines) ? lines.filter((l) => typeof l?.variantId === "string" && l.qty > 0) : [];
  } catch {
    return [];
  }
}

export function clearGuestCart() {
  saveGuestCart([]);
}

/** Modes whose cart lives in the browser: a guest's, and one signed in but without a team yet. */
const isLocal = (mode: CartMode) => mode === "guest" || mode === "noteam";

function set(next: CartState) {
  state = next;
  if (isLocal(next.mode)) saveGuestCart(next.lines);
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

export function cartSnapshot(): CartState {
  return state;
}

/** Replaces the cart with what the server rendered. A guest's lines come from the browser. */
export function syncCart(next: CartState) {
  set(isLocal(next.mode) ? { ...next, lines: readGuestCart() } : next);
}

/** Adds `qty` right away. `line` describes it when it isn't in the cart yet. */
export function addOptimistic(variantId: string, qty: number, line: Omit<CartSheetLine, "qty"> | null) {
  const existing = state.lines.find((l) => l.variantId === variantId);
  if (existing) {
    set({ ...state, lines: state.lines.map((l) => (l === existing ? { ...l, qty: Math.min(l.qty + qty, 9999) } : l)) });
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

/** Whether the cart can be changed here: a guest's in the browser, a team member's on the server. */
export const canEditCart = (mode: CartMode) => isLocal(mode) || mode === "ordering";

export function cartTotals(lines: CartSheetLine[]) {
  return {
    count: lines.reduce((sum, l) => sum + l.qty, 0),
    totalIls: lines.reduce((sum, l) => sum + (l.unitPriceIls ?? 0) * l.qty, 0),
  };
}
