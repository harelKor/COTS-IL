import { hasUsdPrice } from "./pricing";
import { sameName, type GroupProduct } from "./families/group";

/**
 * The admin's catalog fixes (S15). The nightly sync and regroup rewrite products and
 * families from the stores, so the fixes live in their own tables and are applied
 * again every time: hide, photos, category, split, merge and "מומלץ" pins per product,
 * a USD price per variant.
 */

export type ProductOverride = {
  productId: string;
  hidden: boolean;
  images: string[] | null;
  categorySlug: string | null;
  alone: boolean;
  mergeKey: string | null;
  pinRank: number | null;
};

/**
 * The USD price everything reads: the admin's, else the store's. It then goes through
 * priceIls (src/domain/pricing.ts) like any price; an override of 0 or less is ignored.
 */
export function effectivePriceUsd(supplierUsd: string | null, overrideUsd: string | null | undefined): string | null {
  return hasUsdPrice(overrideUsd) ? Number(overrideUsd).toFixed(2) : supplierUsd;
}

/** A product with its store data, as the regroup reads it. */
export type OverridableProduct = GroupProduct & { images: string[] };

/** Drops hidden products and applies photos, category, split and merge before grouping. */
export function applyProductOverrides<T extends OverridableProduct>(products: T[], overrides: Map<string, ProductOverride>): T[] {
  return products.flatMap((p) => {
    const o = overrides.get(p.id);
    if (!o) return [p];
    if (o.hidden) return [];
    return [
      {
        ...p,
        images: o.images?.length ? o.images : p.images,
        categorySlug: o.categorySlug ?? p.categorySlug,
        alone: o.alone || undefined,
        mergeKey: o.mergeKey || null,
      },
    ];
  });
}

/** A family's place in "מומלץ": the lowest pin among its products, or null. */
export function familyPinRank(productIds: string[], overrides: Map<string, ProductOverride>): number | null {
  const ranks = productIds.flatMap((id) => {
    const rank = overrides.get(id)?.pinRank;
    return rank === null || rank === undefined ? [] : [rank];
  });
  return ranks.length ? Math.min(...ranks) : null;
}

/** An empty override is deleted rather than stored. */
export function isEmptyOverride(o: Omit<ProductOverride, "productId">): boolean {
  return !o.hidden && !o.images?.length && !o.categorySlug && !o.alone && !o.mergeKey && o.pinRank === null;
}

export type MultiSupplierMember = { supplierCode: string; title: string; categorySlug: string | null };
export type SkuPrice = { sku: string | null; supplierCode: string; priceUsd: string | null };
export type Suspicion = "names" | "prices" | "categories";

/** How far apart two suppliers' prices for one SKU may be before the merge looks wrong. */
const PRICE_SPREAD = 0.3;

/**
 * Why a family sold by several suppliers may hold different parts: its products'
 * names share nothing or the same SKU costs very different amounts (and, with either,
 * whether the stores file it under different categories). Empty when it looks right.
 */
export function suspiciousMultiSupplier(members: MultiSupplierMember[], prices: SkuPrice[]): Suspicion[] {
  const out: Suspicion[] = [];
  if (new Set(members.map((m) => m.supplierCode)).size < 2) return out;

  const words = members.map((m) => new Set((sameName(m.title) ?? m.title.toLowerCase()).split(/\s+/).filter((w) => w.length > 2 && !/^\d/.test(w))));
  const shared = words.slice(1).every((set) => [...set].some((w) => words[0].has(w)));
  if (!shared) out.push("names");

  const bySku = new Map<string, number[]>();
  for (const p of prices) {
    const sku = p.sku?.trim().toUpperCase();
    if (!sku || !hasUsdPrice(p.priceUsd)) continue;
    bySku.set(sku, [...(bySku.get(sku) ?? []), Number(p.priceUsd)]);
  }
  if ([...bySku.values()].some((list) => list.length > 1 && Math.max(...list) > Math.min(...list) * (1 + PRICE_SPREAD))) out.push("prices");

  // Resellers file parts their own way (CTRE puts WCP's springs under mechanisms), so a
  // different category only adds to another reason.
  if (out.length && new Set(members.map((m) => m.categorySlug ?? "")).size > 1) out.push("categories");
  return out;
}
