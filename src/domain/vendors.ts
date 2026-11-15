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

/**
 * Vendor names as one Hebrew list for running text: "A", "A ו-B", "A, B ו-C". The "ו-" has a hyphen
 * because the names are Latin. Copy takes the names from the DB, so a vendor added in the admin
 * shows up in it by itself.
 */
export function vendorNameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ו-${names.at(-1)}`;
}

/** A vendor's store URL with the usual catalog filters; the vendor is the path, never `?supplier=`. */
export function vendorHref(code: string, filters: Partial<CatalogFilters> = {}): string {
  const query = catalogQuery({ ...filters, supplier: "" });
  const path = `/v/${encodeURIComponent(code)}`;
  return query ? `${path}?${query}` : path;
}

/** Whether a store URL shows results (a category or a search) or the store's front page. */
export function isStoreFront(filters: Pick<CatalogFilters, "q" | "category"> & { group?: string }): boolean {
  return !filters.q && !filters.category && !filters.group;
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

/** The home page's first row, in order (the first sits on the right): AndyMark, WCP, goBILDA. */
const FIRST_ROW = [/andymark/i, /^wcp$|west coast/i, /gobilda/i];

/**
 * The vendors in home-page order: AndyMark, WCP and goBILDA first, in that order, when they're
 * there; everyone else after them in the order given (the catalog's, biggest first).
 */
export function homeVendorOrder<T extends { code: string; name: string }>(vendors: T[]): T[] {
  const rank = (v: T) => {
    const i = FIRST_ROW.findIndex((m) => m.test(v.code) || m.test(v.name));
    return i === -1 ? FIRST_ROW.length : i;
  };
  return vendors.map((v, i) => ({ v, i })).sort((a, b) => rank(a.v) - rank(b.v) || a.i - b.i).map((x) => x.v);
}

/** Whether box i of a part with `count` boxes spans both columns of a 2-column row: a lone last box, so no row has a gap. */
export function spansBoth(i: number, count: number): boolean {
  return count % 2 === 1 && i === count - 1;
}

/**
 * Each vendor's brand palette on the dark pages (Nov 14, 2026): the home page's vendor boxes and
 * its whole store (/v/<code>). primary: borders, washes and fills; secondary: the second tone of a
 * gradient; text: a light tint that reads on the night canvas (counts, prices, links). Matched by
 * code, or by name for a vendor added in the admin (Swerve Drive Specialties); any other vendor
 * gets its admin accent (suppliers.accent_color), else Orbit ultramarine.
 */
const VENDOR_THEMES: { match: RegExp; primary: string; secondary: string; text: string }[] = [
  { match: /andymark/i, primary: "#ef4444", secondary: "#dc2626", text: "#fca5a5" },
  { match: /^ctre$|ctr electronics|cross the road/i, primary: "#84cc16", secondary: "#22c55e", text: "#bef264" },
  { match: /gobilda/i, primary: "#f59e0b", secondary: "#eab308", text: "#fde047" },
  { match: /^wcp$|west coast/i, primary: "#2563eb", secondary: "#3b82f6", text: "#93c5fd" },
  { match: /^rev$|rev robotics/i, primary: "#f97316", secondary: "#ea580c", text: "#fdba74" },
  { match: /^sds$|swerve drive/i, primary: "#94a3b8", secondary: "#cbd5e1", text: "#e2e8f0" },
  { match: /^ttb$|thrifty/i, primary: "#10b981", secondary: "#14b8a6", text: "#6ee7b7" },
];

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** Relative luminance (WCAG), 0 for black to 1 for white. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type VendorPalette = { primary: string; secondary: string; text: string; onPrimary: string };

/** A vendor's palette: the known brands' own, else from its admin accent (or Orbit ultramarine). */
export function vendorPalette(vendor: { code: string; name: string; accentColor?: string | null; accentColor2?: string | null }): VendorPalette {
  const known = VENDOR_THEMES.find((v) => v.match.test(vendor.code) || v.match.test(vendor.name));
  const primary = known?.primary ?? accentColor(vendor.accentColor) ?? "#0018e0";
  const secondary = known?.secondary ?? accentColor(vendor.accentColor2) ?? primary;
  // An unknown brand's text tint: its colour 45% of the way to white.
  const text = known?.text ?? toHex(rgb(primary).map((v) => v + (255 - v) * 0.45));
  // Dark text on a bright fill (amber, lime, silver, mint, orange), white on a deep one (red, blue).
  const onPrimary = luminance(primary) > 0.25 ? "#020416" : "#ffffff";
  return { primary, secondary, text, onPrimary };
}

/** The custom properties a vendor's store wraps its page in (globals.css, ".vendor-theme"). */
export function vendorTheme(vendor: Parameters<typeof vendorPalette>[0]): Record<string, string> {
  const p = vendorPalette(vendor);
  return {
    "--vendor-primary": p.primary,
    "--vendor-primary-rgb": rgb(p.primary).join(" "),
    "--vendor-secondary": p.secondary,
    "--vendor-text-accent": p.text,
    "--vendor-on-primary": p.onPrimary,
  };
}

/** The custom properties behind a vendor's glass box on the home page (--v-deep, --v-light). */
export function vendorGlass(vendor: Parameters<typeof vendorPalette>[0]): Record<string, string> {
  const p = vendorPalette(vendor);
  return { "--v-deep": p.primary, "--v-light": p.text };
}

/**
 * A logo for the dark home page: the bundled logos (public/vendors/<name>.png or .svg, also when
 * linked by full URL) have a copy with white ink in public/vendors/on-dark (`npm run vendor-logos`).
 * null for anything else, such as an admin's upload, which then gets a CSS filter instead.
 */
export function darkLogo(logoUrl: string | null): string | null {
  const m = logoUrl?.match(/(?:^|\/)vendors\/([a-z0-9-]+)\.(?:png|svg)$/i);
  return m ? `/vendors/on-dark/${m[1].toLowerCase()}.png` : null;
}
