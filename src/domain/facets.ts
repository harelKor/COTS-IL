/**
 * Which spec filters are worth showing for what's in view. A spec that only a couple of
 * products have (an "outer diameter" on 2 of 94 motors) is noise, not a filter.
 */

/** A spec must cover at least this share of the products in view… */
export const MIN_FACET_SHARE = 0.15;
/** …and at least this many of them. */
export const MIN_FACET_FAMILIES = 3;
/** A filter with fewer choices than this has nothing to choose between. */
export const MIN_FACET_VALUES = 2;

export type FacetCandidate = {
  key: string;
  /** Products in view that have this spec at all. */
  families: number;
  values: number;
};

/**
 * Keeps the specs that fit what's in view: common enough and with a real choice. A spec
 * the user already filtered by always stays, so its chips can still be cleared.
 */
export function isRelevantFacet(facet: FacetCandidate, total: number, selected: readonly string[] = []): boolean {
  if (selected.includes(facet.key)) return true;
  if (facet.values < MIN_FACET_VALUES) return false;
  return facet.families >= MIN_FACET_FAMILIES && facet.families >= total * MIN_FACET_SHARE;
}

/** Which spec values are counted, under which of the chosen spec filters. */
export type FacetCountPlan<T = string[]> = {
  /** Count these keys' values… */
  keys: { only: string } | { except: string[] };
  /** …among the products that pass these spec filters. */
  specs: Record<string, T>;
};

/**
 * Counts that say what a tap would give (disjunctive facets): a spec's values are counted
 * under every chosen filter except its own, so choosing 1/2" Hex keeps the other bores'
 * counts and narrows the teeth counts to hex-bore gears. A filter is values or a from–to range.
 */
export function facetCountPlans<T extends readonly unknown[] | object = string[]>(specs: Record<string, T>): FacetCountPlan<T>[] {
  const chosen = Object.keys(specs).filter((k) => !Array.isArray(specs[k]) || specs[k].length > 0);
  return [
    { keys: { except: chosen }, specs: Object.fromEntries(chosen.map((k) => [k, specs[k]])) },
    ...chosen.map((key) => ({
      keys: { only: key },
      specs: Object.fromEntries(chosen.filter((k) => k !== key).map((k) => [k, specs[k]])),
    })),
  ];
}

/* ---------- The filter panel (CF2) ---------- */

/** A facet with more values than this is a checkbox list (with search and "הצגת כל N"), not chips. */
export const MAX_CHIP_VALUES = 10;
/** A list facet shows this many rows until "הצגת כל N" (one fewer under a from–to range): 44px rows, and the facet stays under ~320px. */
export const PREVIEW_ROWS = 4;
/** Under this share of the products in view, a facet says how many it knows ("ידוע ל-45 מתוך 167"). */
export const COVERAGE_NOTE_BELOW = 0.9;
/** How many facets are open before the user opens or closes any: the ones most products have. */
export const OPEN_FACETS = 2;

export type FacetValue = { value: string; count: number };

/** Chips for a short facet, a checkbox list for a long one. */
export function facetLayout(valueCount: number): "chips" | "list" {
  return valueCount > MAX_CHIP_VALUES ? "list" : "chips";
}

/**
 * A facet's values in the order they're shown: by size, ascending, when most of them are sizes
 * (`num` is sortValue: mm across units, teeth as is), else the most common first.
 */
export function orderFacetValues<V extends FacetValue & { num: number | null }>(values: V[]): V[] {
  const sized = values.filter((v) => v.num !== null).length;
  const byLabel = (a: V, b: V) => a.value.localeCompare(b.value, "en", { numeric: true });
  if (values.length > 0 && sized / values.length >= 0.75) {
    return [...values].sort((a, b) => {
      if (a.num === null || b.num === null) return a.num === b.num ? byLabel(a, b) : a.num === null ? 1 : -1;
      return a.num - b.num || byLabel(a, b);
    });
  }
  return [...values].sort((a, b) => b.count - a.count || byLabel(a, b));
}

/**
 * The rows a long facet shows before "הצגת כל N": its most common values and every chosen one,
 * kept in the facet's own order (so a numeric facet still runs ascending).
 */
export function previewValues<V extends FacetValue>(values: V[], chosen: readonly string[], rows = PREVIEW_ROWS): V[] {
  const top = new Set(
    [...values]
      .sort((a, b) => b.count - a.count)
      .slice(0, rows)
      .map((v) => v.value),
  );
  return values.filter((v) => top.has(v.value) || chosen.includes(v.value));
}

/** The facets open by default: the `n` that most products in view have (the first ones on a tie). */
export function defaultOpenFacets(facets: { key: string; reach: number }[], n = OPEN_FACETS): string[] {
  return facets
    .map((f, i) => ({ ...f, i }))
    .sort((a, b) => b.reach - a.reach || a.i - b.i)
    .slice(0, n)
    .map((f) => f.key);
}

/** Open or closed: what the user chose this session, else the default. */
export function isFacetOpen(key: string, defaults: readonly string[], chosen: Record<string, boolean>): boolean {
  return chosen[key] ?? defaults.includes(key);
}

/** Whether a facet should say how many products it knows: under ~90% of them. */
export function showsCoverage(reach: number, total: number): boolean {
  return total > 0 && reach < total * COVERAGE_NOTE_BELOW;
}

/* ---------- From–to ranges (teeth, length, OD) and the price ---------- */

export type RangeUnit = "in" | "mm";
/** A from–to range; either end may be open. `unit` only for sizes (length, OD). */
export type NumRange = { min: number | null; max: number | null; unit?: RangeUnit };

/** Specs that also get a from–to range, with the units it can be typed in (the first is the default). */
export const RANGE_KEYS: Record<string, RangeUnit[] | null> = { teeth: null, length: ["in", "mm"], od: ["in", "mm"] };

export function hasRange(key: string): boolean {
  return key in RANGE_KEYS;
}

const MAX_BOUND = 100_000;
const BOUND = String.raw`(\d{1,6}(?:\.\d{1,3})?)`;
const RANGE = new RegExp(String.raw`^${BOUND}?-${BOUND}?(in|mm)?$`);

function bound(text: string | undefined): number | null {
  if (text === undefined) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= MAX_BOUND ? n : null;
}

/** Two ends in order: 40-20 is 20-40. Null when neither end is there. */
function ordered(min: number | null, max: number | null): { min: number | null; max: number | null } | null {
  if (min === null && max === null) return null;
  return min !== null && max !== null && min > max ? { min: max, max: min } : { min, max };
}

/**
 * A range in the URL (`?s.teeth=20-40`, `?s.length=2-6in`, `?s.od=-30mm`), or null when it isn't
 * one or the key has no range. A size without a unit is in the key's first unit.
 */
export function parseRange(key: string, text: string): NumRange | null {
  if (!hasRange(key)) return null;
  const m = text.trim().toLowerCase().replace(/\s+/g, "").match(RANGE);
  if (!m) return null;
  const units = RANGE_KEYS[key];
  if (m[3] && !units?.includes(m[3] as RangeUnit)) return null;
  const ends = ordered(bound(m[1]), bound(m[2]));
  if (!ends) return null;
  return units ? { ...ends, unit: (m[3] as RangeUnit | undefined) ?? units[0] } : ends;
}

export function formatRange(range: NumRange): string {
  return `${range.min ?? ""}-${range.max ?? ""}${range.unit ?? ""}`;
}

/** The range's ends in the units spec_values sort by (sortValue: mm for sizes, teeth as is). */
export function rangeInSortUnits(range: NumRange): { min: number | null; max: number | null } {
  const scale = range.unit === "in" ? 25.4 : 1;
  return { min: range.min === null ? null : range.min * scale, max: range.max === null ? null : range.max * scale };
}

const UNIT_MARK: Record<RangeUnit, string> = { in: '"', mm: "mm" };

/** How a range reads: "20T–40T", '2"–6"', "מ-20mm", "עד 40T". */
export function rangeLabel(key: string, range: NumRange): string {
  const mark = range.unit ? UNIT_MARK[range.unit] : key === "teeth" ? "T" : "";
  const end = (n: number) => `${n}${mark}`;
  if (range.min !== null && range.max !== null) return `${end(range.min)}–${end(range.max)}`;
  return range.min !== null ? `מ-${end(range.min)}` : `עד ${end(range.max!)}`;
}

/** Whole shekels from–to on a family's lowest price (`?price=50-200`). */
export type PriceRange = { min: number | null; max: number | null };

const PRICE = /^(\d{1,7})?-(\d{1,7})?$/;

export function parsePrice(text: string): PriceRange | null {
  const m = text.trim().replace(/\s+/g, "").match(PRICE);
  return m ? ordered(bound(m[1]), bound(m[2])) : null;
}

export function formatPrice(price: PriceRange): string {
  return `${price.min ?? ""}-${price.max ?? ""}`;
}

/** A from–to field's text as a number, or null when it's empty or not a number. */
export function readBound(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (!t) return null;
  return /^\d{1,7}(?:\.\d{1,3})?$/.test(t) ? bound(t) : null;
}
