import { settle, withChoice, type Pickable } from "./pick";

/**
 * What the product page says about prices while a choice is being made: the range of what's
 * left (the headline), and per chip the price a tap on it leads to. The page reads prices
 * only from here, so the chip and the headline after the tap always agree.
 */

export type Priced = Pickable & { priceIls: number | null };

/** A chip's price: exact when the tap settles on one price, else the lowest it leads to ("מ-₪28"). */
export type Preview = { price: number; exact: boolean };

export type Range = { min: number; max: number };

/** Picks the offer a settled choice shows (the supplier asked for, else the best). The page passes its own. */
export type OfferPicker<V> = (candidates: V[]) => V | undefined;

const first = <V>(candidates: V[]) => candidates[0];

/** The variants that fit the choices so far (one value left counts as chosen): what's left to buy. */
export function remaining<V extends Pickable>(variants: V[], keys: string[], choices: Record<string, string>): V[] {
  return settle(variants, keys, choices).candidates;
}

/** The lowest and highest price among `variants`, without the unpriced ones; null when none has a price. */
export function priceRange(variants: { priceIls: number | null }[]): Range | null {
  let range: Range | null = null;
  for (const { priceIls: p } of variants) {
    if (p === null) continue;
    range = range ? { min: Math.min(range.min, p), max: Math.max(range.max, p) } : { min: p, max: p };
  }
  return range;
}

/**
 * The price a tap on `value` of `key` leads to, given the current choices: exact when it
 * settles the part (the offer `offer` picks) or every part left costs the same, "from" the
 * lowest otherwise. A value that clashes leads to the choice on its own (the others clear).
 * The value already chosen shows what it is now. Null when nothing it leads to has a price.
 */
export function chipPreview<V extends Priced>(
  variants: V[],
  keys: string[],
  choices: Record<string, string>,
  key: string,
  value: string,
  offer: OfferPicker<V> = first,
): Preview | null {
  const next = choices[key] === value ? choices : withChoice(variants, choices, key, value);
  const result = settle(variants, keys, next);
  if (result.chosen) {
    const o = offer(result.candidates) ?? result.chosen;
    return o.priceIls === null ? null : { price: o.priceIls, exact: true };
  }
  const range = priceRange(result.candidates);
  return range && { price: range.min, exact: range.min === range.max };
}

/**
 * Every chip's price in a group, by `chipPreview`; all null when they would all read the
 * same (every bore costs ₪28 with this diameter), so a group shows prices only when they help.
 */
export function groupPreviews<V extends Priced>(
  variants: V[],
  keys: string[],
  choices: Record<string, string>,
  key: string,
  values: string[],
  offer: OfferPicker<V> = first,
): (Preview | null)[] {
  const previews = values.map((value) => chipPreview(variants, keys, choices, key, value, offer));
  const shown = new Set(previews.map((p) => (p ? `${p.exact}:${p.price}` : "none")));
  return shown.size > 1 ? previews : previews.map(() => null);
}

/** One supplier's part of what's left: its price range, and whether any of it is in stock. Null when it has none of it. */
export function supplierShare<V extends { priceIls: number | null; supplierCode: string; available: boolean | null }>(
  candidates: V[],
  supplierCode: string,
): { range: Range | null; inStock: boolean } | null {
  const own = candidates.filter((v) => v.supplierCode === supplierCode);
  if (own.length === 0) return null;
  return { range: priceRange(own), inStock: own.some((v) => v.available === true) };
}
