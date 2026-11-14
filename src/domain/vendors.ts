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
 * The home page's vendor boxes (S17, Nov 14, 2026): the first row holds up to 3 vendors across the
 * page, under the tall robot; the rest sit two to a row beside the short robot. How many go in
 * each part.
 */
export function vendorRows(count: number): { first: number; rest: number } {
  const first = Math.min(3, Math.max(0, count));
  return { first, rest: Math.max(0, count - first) };
}

/** Whether box i of a part with `count` boxes spans both columns of a 2-column row: a lone last box, so no row has a gap. */
export function spansBoth(i: number, count: number): boolean {
  return count % 2 === 1 && i === count - 1;
}
