import { formatPrice, formatRange, parsePrice, parseRange, type NumRange, type PriceRange } from "@/domain/facets";
import { normalizeFilterValue } from "@/domain/specs/normalize";

export const PAGE_SIZE = 24;
/** How many pages a single URL can ask for at once, so ?page=999 can't load the whole catalog. */
export const MAX_PAGES = 20;

export const SORTS = ["relevance", "price-asc", "price-desc", "title"] as const;
export type Sort = (typeof SORTS)[number];

export const VIEWS = ["grid", "list"] as const;
export type View = (typeof VIEWS)[number];

/** Spec filters: key to the values any of which a family must have, e.g. { bore: ['1/2" Hex'] }. */
export type SpecFilters = Record<string, string[]>;

export type CatalogFilters = {
  q: string;
  category: string;
  /** A category group's id (content.categoryGroups): every category in the group. A category narrows it further. */
  group: string;
  supplier: string;
  program: "FRC" | "FTC" | "";
  availableOnly: boolean;
  sort: Sort;
  /** With infinite scroll, the number of pages loaded so far. */
  page: number;
  specs: SpecFilters;
  /** From–to ranges on teeth, length and OD (`?s.teeth=20-40`); a key has a range or values, not both. */
  ranges: Record<string, NumRange>;
  /** Whole shekels on the family's lowest price (`?price=50-200`). */
  price: PriceRange | null;
  view: View;
};

type RawParams = Record<string, string | string[] | undefined>;

/** Spec filters live in the URL as s.<key>=<value>, repeated for each value. */
export const SPEC_PREFIX = "s.";
const SPEC_KEY = /^[a-z0-9-]{1,40}$/;
const GROUP_ID = /^[a-z0-9_-]{1,40}$/;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function all(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(list.map((v) => v.trim()).filter((v) => v && v.length <= 60))].slice(0, 12);
}

/** Reads filters from the URL. Anything unrecognized falls back to the default rather than failing. */
export function parseFilters(params: RawParams): CatalogFilters {
  const program = single(params.program);
  const sort = single(params.sort) as Sort;
  const view = single(params.view) as View;
  const page = Number(single(params.page));
  const specs: SpecFilters = {};
  const ranges: Record<string, NumRange> = {};
  for (const [name, value] of Object.entries(params)) {
    if (!name.startsWith(SPEC_PREFIX)) continue;
    const key = name.slice(SPEC_PREFIX.length);
    if (!SPEC_KEY.test(key)) continue;
    for (const raw of all(value)) {
      // A from–to range (teeth, length, OD) instead of values.
      const range = parseRange(key, raw);
      if (range) {
        ranges[key] = range;
        continue;
      }
      // In their stored form, so an old link (?s.bore=1/2 in. Hex) still finds the 1/2" Hex parts (CF1).
      const { key: k, value: v } = normalizeFilterValue(key, raw);
      if (SPEC_KEY.test(k) && !(specs[k] ??= []).includes(v)) specs[k].push(v);
    }
  }
  // A range wins over values on the same key (the panel never writes both).
  for (const key of Object.keys(ranges)) delete specs[key];
  return {
    q: single(params.q).slice(0, 100),
    category: single(params.category),
    group: GROUP_ID.test(single(params.group)) ? single(params.group) : "",
    supplier: single(params.supplier),
    program: program === "FRC" || program === "FTC" ? program : "",
    availableOnly: single(params.available) === "1",
    sort: SORTS.includes(sort) ? sort : "relevance",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, MAX_PAGES) : 1,
    specs: Object.fromEntries(Object.entries(specs).slice(0, 6)),
    ranges: Object.fromEntries(Object.entries(ranges).slice(0, 3)),
    price: parsePrice(single(params.price)),
    view: VIEWS.includes(view) ? view : "grid",
  };
}

/** The query string for filters, leaving out defaults so URLs stay short and shareable. */
export function catalogQuery(filters: Partial<CatalogFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.group) params.set("group", filters.group);
  if (filters.supplier) params.set("supplier", filters.supplier);
  if (filters.program) params.set("program", filters.program);
  if (filters.availableOnly) params.set("available", "1");
  const ranges = filters.ranges ?? {};
  for (const key of [...new Set([...Object.keys(filters.specs ?? {}), ...Object.keys(ranges)])].sort()) {
    if (ranges[key]) params.append(`${SPEC_PREFIX}${key}`, formatRange(ranges[key]));
    else for (const value of filters.specs![key]) params.append(`${SPEC_PREFIX}${key}`, value);
  }
  if (filters.price) params.set("price", formatPrice(filters.price));
  if (filters.sort && filters.sort !== "relevance") params.set("sort", filters.sort);
  if (filters.view && filters.view !== "grid") params.set("view", filters.view);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}

export function catalogHref(filters: Partial<CatalogFilters>): string {
  const query = catalogQuery(filters);
  return query ? `/catalog?${query}` : "/catalog";
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** Adds or removes one value of a spec filter (dropping that key's range). Changing filters always starts again from page 1. */
export function toggleSpec(filters: CatalogFilters, key: string, value: string): CatalogFilters {
  const current = filters.specs[key] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  const specs = { ...filters.specs };
  if (next.length > 0) specs[key] = next;
  else delete specs[key];
  return { ...filters, specs, ranges: without(filters.ranges, key), page: 1 };
}

/** Sets or clears a spec's from–to range (dropping the values chosen on that key). */
export function setRange(filters: CatalogFilters, key: string, range: NumRange | null): CatalogFilters {
  const ranges = without(filters.ranges, key);
  return { ...filters, specs: without(filters.specs, key), ranges: range ? { ...ranges, [key]: range } : ranges, page: 1 };
}

/** True when anything narrows the list, so "Clear" has something to clear. */
export function hasFilters(filters: CatalogFilters): boolean {
  return !!(
    filters.supplier ||
    filters.program ||
    filters.availableOnly ||
    filters.price ||
    Object.keys(filters.specs).length > 0 ||
    Object.keys(filters.ranges).length > 0
  );
}

/** The filters on in the panel (program, stock, price, each spec value and range), for the phone's "סינון (3)". */
export function panelFilterCount(filters: CatalogFilters): number {
  return (
    (filters.program ? 1 : 0) +
    (filters.availableOnly ? 1 : 0) +
    (filters.price ? 1 : 0) +
    Object.values(filters.specs).reduce((n, v) => n + v.length, 0) +
    Object.keys(filters.ranges).length
  );
}

/** Everything the panel's "נקה הכל" clears; the category, group, search and supplier stay. */
export function clearPanel(filters: CatalogFilters): CatalogFilters {
  return { ...filters, program: "", availableOnly: false, specs: {}, ranges: {}, price: null, page: 1 };
}

