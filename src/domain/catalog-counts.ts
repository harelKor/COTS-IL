/**
 * The one count of the catalog (audit L-05, Nov 14, 2026). Every number a screen shows about how
 * many things there are comes from here: the home page, /catalog, the vendor boxes and stores,
 * the category chips and the admin's category list. The unit is the family: one part in all its
 * sizes, as a customer sees it on one card.
 *
 * Pure so it can be tested; src/lib/catalog.ts feeds it the visible families' rows.
 */

/** A family a customer can see: which vendors sell it and which category holds it. */
export type CountedFamily = { supplierCodes: string[]; categoryId: string | null };

export type CatalogCounts = {
  /** Distinct families. A family two vendors sell counts once here, and once for each of them below. */
  families: number;
  /** Families each active vendor sells, counted from that vendor's own rows. */
  vendors: Record<string, number>;
  /** Families in each category, by category id. */
  categories: Record<string, number>;
};

/** Counts the families once: in total, per active vendor and per category. */
export function tallyFamilies(families: CountedFamily[], activeVendors: string[]): CatalogCounts {
  const active = new Set(activeVendors);
  const vendors: Record<string, number> = Object.fromEntries(activeVendors.map((code) => [code, 0]));
  const categories: Record<string, number> = {};
  for (const f of families) {
    // A code listed twice on one family still counts the family once.
    for (const code of new Set(f.supplierCodes)) if (active.has(code)) vendors[code]++;
    if (f.categoryId) categories[f.categoryId] = (categories[f.categoryId] ?? 0) + 1;
  }
  return { families: families.length, vendors, categories };
}
