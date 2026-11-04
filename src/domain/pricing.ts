/** Spec rule: the ILS price, including VAT, is the supplier's USD price × 1.6. */
export const DEFAULT_MULTIPLIER = 1.6;

/** ILS price in whole shekels, or null when the item has no usable price and can't be ordered. */
export function priceIls(usd: string | number | null | undefined, multiplier = DEFAULT_MULTIPLIER): number | null {
  if (usd === null || usd === undefined) return null;
  const value = typeof usd === "string" ? Number(usd) : usd;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * multiplier);
}

const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

export function formatIls(amount: number): string {
  return ils.format(amount);
}
