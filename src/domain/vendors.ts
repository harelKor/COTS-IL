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

/** The CSS custom property that tints a vendor's glow and outline; none when it has no accent. */
export function accentStyle(value: string | null | undefined): Record<string, string> | undefined {
  const color = accentColor(value);
  return color ? { "--accent": color } : undefined;
}

/** The line under a vendor's name: its biggest categories, e.g. "גלגלי שיניים, צירים ומנועים". */
export function vendorBlurb(categories: { name: string; count: number }[], max = 3): string | null {
  const names = [...categories].sort((a, b) => b.count - a.count).slice(0, max).map((c) => c.name);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ו${names.at(-1)}`;
}

/** Desktop columns for N vendor boxes: one row up to 5, then rows of 3 or 4 that stay even. */
export function vendorColumns(count: number): 1 | 2 | 3 | 4 | 5 {
  if (count <= 5) return Math.max(1, count) as 1 | 2 | 3 | 4 | 5;
  return count === 6 || count === 9 ? 3 : 4;
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
