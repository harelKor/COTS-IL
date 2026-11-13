/**
 * The price rule, the only price code (S16a): the ILS price is the supplier's USD
 * price × the USD→ILS rate × the multiplier, no VAT, rounded to whole shekels (or
 * the admin's step) and never below the admin's minimum.
 * - The rate is the Bank of Israel rate the daily sync stores (src/lib/fx.ts), or the
 *   admin's manual rate while one is set.
 * - The multiplier is resolved per part by resolveMarkup: category > supplier > global
 *   (1.6 until the admin changes it in /admin/settings/pricing). A part's fixed ₪ price
 *   (S16c) beats them all.
 */
export const DEFAULT_MARKUP = 1.6;

/** Everything a price needs besides the part's own USD price and multiplier, from getPricing() (src/lib/settings.ts). */
export type PriceContext = {
  /** USD→ILS, the admin's manual rate if set, else the Bank of Israel one. */
  rate: number;
  /** The global multiplier, for parts the regroup hasn't resolved yet. */
  markup: number;
  /** 1, 5 or 10: whole shekels or the nearest step. */
  roundTo: number;
  /** No price below this; null for none. */
  minIls: number | null;
};

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

/** Rounds a shekel amount to the step, never below the minimum, and never to nothing: nothing in the catalog is free. */
export function roundIls(value: number, ctx: Pick<PriceContext, "roundTo" | "minIls">): number {
  const step = ctx.roundTo > 0 ? ctx.roundTo : 1;
  const rounded = Math.round(value / step) * step || step;
  return Math.max(ctx.minIls ?? 0, rounded);
}

/**
 * ILS price (USD × rate × multiplier, no VAT), or null when the item has no usable
 * price and can't be ordered. `markup` is the part's resolved multiplier
 * (variants.markup); without one the global multiplier applies. Pass 1 for a
 * family's list price (product_families.min_list_usd), which already includes it.
 */
export function priceIls(
  usd: string | number | null | undefined,
  ctx: PriceContext,
  markup?: string | number | null,
  /** The part's fixed ₪ price (variants.fixed_ils, S16c): it beats the rate, the multiplier, rounding and the minimum. */
  fixedIls?: string | number | null,
): number | null {
  if (fixedIls !== null && fixedIls !== undefined && Number(fixedIls) > 0) return Number(fixedIls);
  if (!hasUsdPrice(usd)) return null;
  const m = markup === null || markup === undefined || !(Number(markup) > 0) ? ctx.markup : Number(markup);
  return roundIls(Number(usd) * assertRate(ctx.rate) * m, ctx);
}

export type PricingRuleSet = {
  global: number;
  /** supplier id → multiplier */
  bySupplier: Map<string, number>;
  /** category id → multiplier */
  byCategory: Map<string, number>;
};

export type ResolvedPrice =
  | { kind: "fixed"; ils: number }
  | { kind: "markup"; markup: number; source: "category" | "supplier" | "global" };

/**
 * Which rule prices a part. Precedence: the part's fixed ₪ price (S16c) > its
 * category's multiplier > its supplier's > the global one.
 */
export function resolveMarkup(
  rules: PricingRuleSet,
  part: { supplierId?: string | null; categoryId?: string | null; fixedIls?: number | null },
): ResolvedPrice {
  if (part.fixedIls !== null && part.fixedIls !== undefined && part.fixedIls > 0) return { kind: "fixed", ils: part.fixedIls };
  const category = part.categoryId ? rules.byCategory.get(part.categoryId) : undefined;
  if (category !== undefined) return { kind: "markup", markup: category, source: "category" };
  const supplier = part.supplierId ? rules.bySupplier.get(part.supplierId) : undefined;
  if (supplier !== undefined) return { kind: "markup", markup: supplier, source: "supplier" };
  return { kind: "markup", markup: rules.global, source: "global" };
}

const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

export function formatIls(amount: number): string {
  return ils.format(amount);
}

/** "1.6" → "1.6", 1.65 → "1.65": the multiplier as people write it. */
export function formatMarkup(markup: number): string {
  return String(Number(markup.toFixed(3)));
}

/** The multipliers in use, as the price explanation says them: "1.6", or "1.4 עד 1.6" when rules differ. */
export function markupText([low, high]: readonly [number, number]): string {
  return low === high ? formatMarkup(low) : `${formatMarkup(low)} עד ${formatMarkup(high)}`;
}
