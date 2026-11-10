/**
 * The price rule (decided Nov 10, 2026): the ILS price, VAT included, is the
 * supplier's USD price × the Bank of Israel representative USD rate × 1.6,
 * rounded to whole shekels. The rate is fetched by the daily sync (src/lib/fx.ts).
 */
export const MARKUP = 1.6;

/** True when a USD price is a real, positive number, i.e. the part can be priced and ordered. */
export function hasUsdPrice(usd: string | number | null | undefined): boolean {
  if (usd === null || usd === undefined) return false;
  const value = typeof usd === "string" ? Number(usd) : usd;
  return Number.isFinite(value) && value > 0;
}

/** A usable USD→ILS rate, or an error: a missing or zero rate must never price the catalog. */
export function assertRate(usdIlsRate: number): number {
  if (!Number.isFinite(usdIlsRate) || usdIlsRate <= 0) throw new Error(`Invalid USD→ILS rate: ${usdIlsRate}`);
  return usdIlsRate;
}

/** ILS price in whole shekels, VAT included, or null when the item has no usable price and can't be ordered. */
export function priceIls(usd: string | number | null | undefined, usdIlsRate: number, markup = MARKUP): number | null {
  if (!hasUsdPrice(usd)) return null;
  const value = Number(usd);
  // Tiny parts can round down to nothing, and nothing in the catalog is free.
  return Math.max(1, Math.round(value * assertRate(usdIlsRate) * markup));
}

const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

export function formatIls(amount: number): string {
  return ils.format(amount);
}
