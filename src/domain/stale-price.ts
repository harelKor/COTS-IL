/**
 * Prices of a supplier with no good sync for too long (M1, STALE_PRICE_DAYS in health.ts) are
 * hidden: those parts show "המחיר ייבדק בהצעה" instead of an old price that looks current.
 */

/** True when the supplier's price must not be shown. */
export function isStale(code: string | null | undefined, stale: readonly string[]): boolean {
  return !!code && stale.includes(code);
}

/** True when every supplier on a card or result is stale (at least one supplier, none fresh). */
export function allStale(codes: readonly string[], stale: readonly string[]): boolean {
  return codes.length > 0 && stale.length > 0 && codes.every((c) => stale.includes(c));
}

/** True when some, not all, of the suppliers are stale: a range of prices then needs the fresh ones only. */
export function someStale(codes: readonly string[], stale: readonly string[]): boolean {
  return stale.length > 0 && codes.some((c) => stale.includes(c)) && !allStale(codes, stale);
}
