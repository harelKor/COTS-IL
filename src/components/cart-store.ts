"use client";

import { useSyncExternalStore } from "react";
import { maxMerge } from "@/domain/cart";

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
  /** False once the part left the catalog or lost its price: the line blocks the send until removed. Unknown (a guest's line) counts as true. */
  orderable?: boolean;
  /** The supplier's yes/no and when it was checked (ISO). Not sold out doesn't block the send. */
  available?: boolean | null;
  checkedAt?: string | null;
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

export type CartState = {
  mode: CartMode;
  lines: CartSheetLine[];
  team?: CartTeam;
  checkout?: Checkout;
  googleSignIn?: boolean;
  /** Parts from the cart built before sign-in that couldn't join the team's cart. */
  mergeSkipped?: string[];
};

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

/**
 * Puts a cart a sign-in link brought back into the browser's guest cart, each
 * part at the larger quantity, so opening the link twice doubles nothing. The
 * normal sign-in merge then takes it into the team's cart.
 */
export function stashGuestLines(incoming: CartSheetLine[]) {
  const current = readGuestCart();
  const changes = new Map(maxMerge(current, incoming).map((c) => [c.variantId, c.qty]));
  const merged = [
    ...current.map((l) => (changes.has(l.variantId) ? { ...l, qty: changes.get(l.variantId)! } : l)),
    ...incoming.filter((l) => !current.some((c) => c.variantId === l.variantId)),
  ];
  saveGuestCart(merged);
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

/**
 * Cart writes still on their way to the server (waiting out the debounce, or
 * sent). While any are, a server render is older than what the viewer sees, so
 * its lines are ignored; otherwise fast taps would jump back (2, 3, 4, 3, 5).
 */
let pendingWrites = 0;
export const writeStarted = () => void pendingWrites++;
export const writeEnded = () => void (pendingWrites = Math.max(0, pendingWrites - 1));

/** Replaces the cart with what the server rendered. A guest's lines come from the browser. */
export function syncCart(next: CartState) {
  const keep = { mergeSkipped: state.mergeSkipped };
  if (isLocal(next.mode)) set({ ...next, ...keep, lines: readGuestCart() });
  else if (pendingWrites > 0 && next.mode === state.mode) set({ ...next, ...keep, lines: state.lines });
  else set({ ...next, ...keep });
}

/** Replaces every line with the server's (after a merge). */
export function replaceLines(lines: CartSheetLine[]) {
  set({ ...state, lines });
}

export function setMergeSkipped(titles: string[] | undefined) {
  set({ ...state, mergeSkipped: titles?.length ? titles : undefined });
}

/**
 * A shared cart in a guest's browser cart: each part ends at the larger of the
 * two quantities (maxMerge), never the sum. Returns how many lines changed.
 */
export function mergeLocal(incoming: (Omit<CartSheetLine, "qty"> & { qty: number })[]): number {
  const changes = maxMerge(state.lines, incoming);
  const byId = new Map(changes.map((c) => [c.variantId, c.qty]));
  const lines = state.lines.map((l) => (byId.has(l.variantId) ? { ...l, qty: byId.get(l.variantId)! } : l));
  for (const line of incoming) {
    if (byId.has(line.variantId) && !state.lines.some((l) => l.variantId === line.variantId)) lines.push({ ...line, qty: byId.get(line.variantId)! });
  }
  set({ ...state, lines });
  return changes.length;
}

/** Puts the server's copy of one line in place (after a write), or takes it out when `line` is null. */
export function applyServerLine(variantId: string, line: CartSheetLine | null) {
  const exists = state.lines.some((l) => l.variantId === variantId);
  if (!line) set({ ...state, lines: state.lines.filter((l) => l.variantId !== variantId) });
  else if (exists) set({ ...state, lines: state.lines.map((l) => (l.variantId === variantId ? line : l)) });
  else set({ ...state, lines: [...state.lines, line] });
}

export function findLine(variantId: string): CartSheetLine | null {
  return state.lines.find((l) => l.variantId === variantId) ?? null;
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

/** Marks lines the server refused to send, so the sheet names them with a Remove button. */
export function markBlocked(variantIds: string[]) {
  const ids = new Set(variantIds);
  set({ ...state, lines: state.lines.map((l) => (ids.has(l.variantId) ? { ...l, orderable: false } : l)) });
}

/** Whether the cart can be changed here: a guest's in the browser, a team member's on the server. */
export const canEditCart = (mode: CartMode) => isLocal(mode) || mode === "ordering";

/** Item count and ₪ total. Lines that can't be ordered any more don't count toward the total. */
export function cartTotals(lines: CartSheetLine[]) {
  return {
    count: lines.reduce((sum, l) => sum + l.qty, 0),
    totalIls: lines.reduce((sum, l) => sum + (l.orderable === false ? 0 : (l.unitPriceIls ?? 0) * l.qty), 0),
  };
}
