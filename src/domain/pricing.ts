/**
 * The price rule, the only price code (S16a): the ILS price is the supplier's USD
 * price × the USD→ILS rate × the multiplier, rounded to whole shekels (or the admin's
 * step) and never below the admin's minimum. Since Nov 24, 2026 the business is an
 * עוסק מורשה and every ₪ price on the site is final and includes VAT (D1 in
 * docs/PAYMENTS-MORNING-PLAN.md): the multiplier is VAT-inclusive, and quotes split the
 * VAT out with vatSplit at the rate snapshotted on the quote.
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
  /** Supplier code → the tag its discount shows ("הנחת FTC"), for the suppliers with a discount on (pricing.discounts). */
  discountLabels?: Readonly<Record<string, string>>;
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
 * ILS price (USD × rate × multiplier, VAT included), or null when the item has no usable
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
const ilsAgorot = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole shekels, as every catalog and quote price is. Pass `agorot` for an amount that may have them (VAT, payments). */
export function formatIls(amount: number, opts?: { agorot?: boolean }): string {
  if (opts?.agorot && !Number.isInteger(Math.round(amount * 100) / 100)) return ilsAgorot.format(amount);
  return ils.format(amount);
}

/** The VAT rate until the admin changes it (pricing.vatRate in the settings): 18% since Jan 2025. */
export const DEFAULT_VAT_RATE = 0.18;

/** What every price explanation says about VAT: prices are final. */
export const VAT_INCLUDED = "כולל מע״מ";

/** "מע״מ 18%" for a rate of 0.18. */
export function vatLabel(rate: number): string {
  return `מע״מ ${Number((rate * 100).toFixed(2))}%`;
}

/** Shekels to whole agorot, so sums never drift (0.1 + 0.2). */
export const toAgorot = (ils: number) => Math.round(ils * 100);

/**
 * A VAT-inclusive amount split into net and VAT, in shekels rounded to agorot, so that
 * net + vat === gross exactly: net = gross ÷ (1 + rate), rounded, and VAT is the rest.
 */
export function vatSplit(grossIls: number, rate: number): { net: number; vat: number; gross: number } {
  const gross = toAgorot(grossIls);
  if (!(rate > 0)) return { net: gross / 100, vat: 0, gross: gross / 100 };
  const net = Math.round(gross / (1 + rate));
  return { net: net / 100, vat: (gross - net) / 100, gross: gross / 100 };
}

/** "1.6" → "1.6", 1.65 → "1.65": the multiplier as people write it. */
export function formatMarkup(markup: number): string {
  return String(Number(markup.toFixed(3)));
}

/** The multipliers in use, as the price explanation says them: "1.6", or "1.4 עד 1.6" when rules differ. */
export function markupText([low, high]: readonly [number, number]): string {
  return low === high ? formatMarkup(low) : `${formatMarkup(low)} עד ${formatMarkup(high)}`;
}

/**
 * A supplier's discount (pricing.discounts in the settings), such as goBILDA's 25% for FIRST
 * teams, which the admin gets when buying. It comes off the supplier's USD price before the
 * multiplier, so the margin stays the same and every price, cart and order item reads the
 * lower USD price. The exclusions are the supplier's own subcategory (products.product_type,
 * e.g. goBILDA's "MERCH") and SKUs.
 */
export type SupplierDiscount = {
  supplier: string;
  /** Whole percent, 25 for 25%. */
  percent: number;
  label: string;
  enabled: boolean;
  excludeTypes: readonly string[];
  excludeSkus: readonly string[];
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The discount on one part as a fraction (0.25), or null. None for a part the admin priced by
 * hand (a USD override or a custom part), an excluded subcategory or SKU, or a rule that's off.
 */
export function resolveDiscount(
  rules: readonly SupplierDiscount[],
  part: { supplierCode: string; productType?: string | null; sku?: string | null; priceOverridden?: boolean; custom?: boolean },
): number | null {
  if (part.priceOverridden || part.custom) return null;
  const rule = rules.find((r) => r.enabled && r.supplier === part.supplierCode);
  if (!rule || !(rule.percent > 0 && rule.percent < 100)) return null;
  if (part.productType && rule.excludeTypes.some((t) => norm(t) === norm(part.productType!))) return null;
  if (part.sku && rule.excludeSkus.some((s) => norm(s) === norm(part.sku!))) return null;
  return Math.round(rule.percent * 10) / 1000;
}

/** The supplier's USD price less the discount, to the cent: what the admin pays. */
export function discountedUsd(usd: number, discount: number | null | undefined): number {
  if (!discount || !(discount > 0 && discount < 1)) return usd;
  return Math.round(usd * (1 - discount) * 100) / 100;
}

/** Supplier code → tag, for the rules that are on (PriceContext.discountLabels). */
export function discountLabels(rules: readonly SupplierDiscount[]): Record<string, string> {
  return Object.fromEntries(rules.filter((r) => r.enabled && r.percent > 0).map((r) => [r.supplier, r.label]));
}

/** What a price shows beside it when the supplier's discount applied: the tag and the struck price. */
export type PriceDiscount = { label: string; beforeIls: number };

/**
 * The tag and the price before the discount for one part, or null when none applies or it
 * wouldn't show: a fixed ₪ price (S16c) is the admin's own, and a struck price must be higher.
 */
export function partDiscount(
  part: { supplierCode: string; discount?: string | number | null; supplierPriceUsd?: string | number | null; markup?: string | number | null; fixedIls?: string | number | null },
  ctx: PriceContext,
  priceIlsNow: number | null,
): PriceDiscount | null {
  if (!part.discount || !(Number(part.discount) > 0) || priceIlsNow === null) return null;
  if (part.fixedIls !== null && part.fixedIls !== undefined && Number(part.fixedIls) > 0) return null;
  const label = ctx.discountLabels?.[part.supplierCode];
  if (!label) return null;
  const beforeIls = priceIls(part.supplierPriceUsd, ctx, part.markup);
  return beforeIls !== null && beforeIls > priceIlsNow ? { label, beforeIls } : null;
}

/**
 * The tag and the lowest struck price for a choice of parts not settled yet (a product page
 * before every option is chosen, a card): only when every priced part has the discount.
 */
export function commonDiscount(parts: readonly { priceIls: number | null; discount: PriceDiscount | null }[]): PriceDiscount | null {
  const priced = parts.filter((p) => p.priceIls !== null);
  if (priced.length === 0 || !priced.every((p) => p.discount)) return null;
  return { label: priced[0].discount!.label, beforeIls: Math.min(...priced.map((p) => p.discount!.beforeIls)) };
}
