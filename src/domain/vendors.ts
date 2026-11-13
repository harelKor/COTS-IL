import { catalogQuery, type CatalogFilters } from "@/lib/catalog-filters";

/** The vendors with a store page, in the home page's order, with a short Hebrew line on what teams buy there. */
export const VENDORS = [
  { code: "wcp", name: "WCP", blurb: "מנועי Kraken, גלגלי שיניים, צירים ומבנה" },
  { code: "ctre", name: "CTRE", blurb: "מנועים, בקרי מנוע, חיישנים ואלקטרוניקה" },
  { code: "andymark", name: "AndyMark", blurb: "גלגלים, תיבות הילוכים, שלדות ומנגנונים" },
  { code: "ttb", name: "The Thrifty Bot", blurb: "מודולי סוורב, גלגלים וחלקי הנעה" },
] as const;

const BLURBS = new Map<string, string>(VENDORS.map((v) => [v.code, v.blurb]));

export function vendorBlurb(code: string): string | null {
  return BLURBS.get(code) ?? null;
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
