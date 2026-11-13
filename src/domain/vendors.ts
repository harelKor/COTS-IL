import { catalogQuery, type CatalogFilters } from "@/lib/catalog-filters";

/**
 * Vendors come from the `suppliers` table (active, with something published); nothing here lists
 * them. These helpers only shape what a vendor's box and store show.
 */

/** What the admin's colour picker shows for a vendor with no accent: the brand blue. */
export const DEFAULT_ACCENT = "#1d4ed8";

/** A vendor's accent as stored ("#16a34a"), or null for an unset or malformed value (brand blue then). */
export function accentColor(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase() ?? "";
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/**
 * The custom properties that tint a vendor's glow, outline and box: its brand colour and, when
 * it has two (CTRE green and black, The Thrifty Bot green and white), the second one. None: brand blue.
 */
export function accentStyle(primary: string | null | undefined, secondary?: string | null): Record<string, string> | undefined {
  const one = accentColor(primary);
  if (!one) return undefined;
  const two = accentColor(secondary);
  return two ? { "--accent": one, "--accent-2": two } : { "--accent": one };
}

/** The line under a vendor's name: its biggest categories, e.g. "גלגלי שיניים, צירים ומנועים". */
export function vendorBlurb(categories: { name: string; count: number }[], max = 3): string | null {
  const names = [...categories].sort((a, b) => b.count - a.count).slice(0, max).map((c) => c.name);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ו${names.at(-1)}`;
}

/** A vendor's store URL with the usual catalog filters; the vendor is the path, never `?supplier=`. */
export function vendorHref(code: string, filters: Partial<CatalogFilters> = {}): string {
  const query = catalogQuery({ ...filters, supplier: "" });
  const path = `/v/${encodeURIComponent(code)}`;
  return query ? `${path}?${query}` : path;
}

/** Whether a store URL shows results (a category or a search) or the store's front page. */
export function isStoreFront(filters: Pick<CatalogFilters, "q" | "category">): boolean {
  return !filters.q && !filters.category;
}

/**
 * How many columns each vendor box spans so the grid's last row is always full: 2 columns from
 * 640px (`sm`, out of 2) and 3 per row from 1024px (`lg`, out of a 6-column grid). A lone last box
 * spans the whole row; two last boxes share it. Holds for any number of vendors.
 */
export function vendorSpans(count: number): { sm: 1 | 2; lg: 2 | 3 | 6 }[] {
  return Array.from({ length: count }, (_, i) => {
    const sm = count % 2 === 1 && i === count - 1 ? 2 : 1;
    const rest = count % 3;
    const lg = rest === 1 && i === count - 1 ? 6 : rest === 2 && i >= count - 2 ? 3 : 2;
    return { sm, lg };
  });
}
