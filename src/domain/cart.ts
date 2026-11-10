/**
 * Cart rules that don't need a database: which lines can be ordered, how two
 * carts combine, and the fingerprint that tells a sender the cart changed.
 */

import { hasUsdPrice } from "./pricing";

export const MAX_LINE_QTY = 9999;

export const clampQty = (qty: number) => Math.min(Math.max(Math.round(qty), 1), MAX_LINE_QTY);

/** What the catalog knows about a cart line's part right now. */
export type LineFacts = {
  variantMissing: Date | null;
  productMissing: Date | null;
  productStatus: string;
  priceUsd: string | null;
};

/**
 * A line can be sent only while its part is still sold and has a price. Anything
 * else stops the whole request, so the sheet names it with a Remove button.
 */
export function isOrderable(l: LineFacts): boolean {
  return !l.variantMissing && !l.productMissing && l.productStatus === "published" && hasUsdPrice(l.priceUsd);
}

export type QtyLine = { variantId: string; qty: number };

/**
 * How a shared cart (or a guest's cart at sign-in) joins a cart that may hold
 * the same parts: each part ends at the larger of the two quantities, never the
 * sum, so opening the same link twice or merging twice doesn't double anything.
 * Returns only the lines that change, with the quantity each should end at.
 */
export function maxMerge(own: readonly QtyLine[], incoming: readonly QtyLine[]): QtyLine[] {
  const current = new Map(own.map((l) => [l.variantId, l.qty]));
  const wanted = new Map<string, number>();
  for (const l of incoming) {
    if (!(l.qty > 0)) continue;
    wanted.set(l.variantId, Math.max(wanted.get(l.variantId) ?? 0, clampQty(l.qty)));
  }
  const changes: QtyLine[] = [];
  for (const [variantId, qty] of wanted) {
    if (qty > (current.get(variantId) ?? 0)) changes.push({ variantId, qty });
  }
  return changes;
}

/**
 * The cart as its sender saw it: ids and quantities in a fixed order. The send
 * carries it, and the server refuses when the team's cart no longer matches,
 * because someone else on the same team account changed it in the meantime.
 */
export function cartFingerprint(lines: readonly QtyLine[]): string {
  return lines
    .map((l) => `${l.variantId.toLowerCase()}:${l.qty}`)
    .sort()
    .join(",");
}

export type CartChange = { variantId: string; before: number; after: number };

/** What changed between the cart the sender saw and the cart in the database (0 = not in that cart). */
export function cartChanges(seen: readonly QtyLine[], actual: readonly QtyLine[]): CartChange[] {
  const before = new Map(seen.map((l) => [l.variantId, l.qty]));
  const after = new Map(actual.map((l) => [l.variantId, l.qty]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids]
    .map((variantId) => ({ variantId, before: before.get(variantId) ?? 0, after: after.get(variantId) ?? 0 }))
    .filter((c) => c.before !== c.after);
}

/** Lines grouped by supplier, in the order each supplier first appears. */
export function groupBySupplier<T extends { supplierName: string }>(lines: readonly T[]): { supplierName: string; lines: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const group = groups.get(line.supplierName);
    if (group) group.push(line);
    else groups.set(line.supplierName, [line]);
  }
  return [...groups].map(([supplierName, ls]) => ({ supplierName, lines: ls }));
}
