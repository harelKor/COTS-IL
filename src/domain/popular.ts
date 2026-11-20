/**
 * What a vendor's store shows first ("הכי מבוקשים") and the daily "גלו עוד" strip.
 * Pure: src/lib/catalog.ts loads one row of signals per family the vendor sells.
 */

export type FamilySignals = {
  id: string;
  /** The admin's "מומלץ" pin on this vendor's products (S15), lowest first; null when not pinned. */
  pinRank: number | null;
  /** The vendor's own best-seller position (1 = best), from its store's "best selling" sort at sync; null when unknown. */
  bestSellerRank: number | null;
  /** Distinct teams that ordered this vendor's parts of the family in the last 12 months (cancelled orders left out). */
  teams: number;
  /** Units ordered over the same period. */
  qty: number;
  available: boolean;
  /** "Wire bundle", "spare", "replacement": filed with a part, rarely what a team came for. */
  accessory: boolean;
  hasImage: boolean;
  /** The vendor's lowest list price (USD × multiplier); null when it has no price. */
  priceUsd: number | null;
};

/** Best-seller positions below this count for nothing. */
export const RANK_SPAN = 120;
/** Distinct ordering teams (across the vendor) at which real orders fully outweigh the store's best-seller list. */
export const ORDERS_FULL_WEIGHT_TEAMS = 25;

const orderScore = (f: FamilySignals) => f.teams * 4 + Math.min(f.qty, 40) / 4;
const rankScore = (f: FamilySignals) => (f.bestSellerRank === null ? 0 : Math.max(0, 1 - (f.bestSellerRank - 1) / RANK_SPAN));

/**
 * How much real orders count, from 0 (no orders yet: the vendor's best-seller list decides)
 * to 1 (enough teams ordering: our own demand decides). Grows with the distinct teams.
 */
export function orderWeight(families: FamilySignals[]): number {
  const teams = families.reduce((n, f) => n + f.teams, 0);
  return Math.min(1, teams / ORDERS_FULL_WEIGHT_TEAMS);
}

/** Each family's demand, 0..1: real orders and the vendor's best-seller rank, blended by orderWeight. */
export function demandScores(families: FamilySignals[]): Map<string, number> {
  const w = orderWeight(families);
  const top = Math.max(0, ...families.map(orderScore));
  return new Map(
    families.map((f) => {
      const orders = top > 0 ? orderScore(f) / top : 0;
      const score = w * orders + (1 - w) * rankScore(f);
      // Sold out still shows, behind what can ship.
      return [f.id, f.available ? score : score / 2];
    }),
  );
}

/**
 * The vendor's most wanted: pinned families first (by pin), then by demand, then (with no
 * demand at all) parts a team comes for: in stock, not an accessory, with a photo, pricier first.
 */
export function rankPopular(families: FamilySignals[], limit: number): string[] {
  const demand = demandScores(families);
  const fallback = (f: FamilySignals) => [f.available ? 0 : 1, f.accessory ? 1 : 0, f.hasImage ? 0 : 1, -(f.priceUsd ?? 0)];
  return [...families]
    .sort((a, b) => {
      if (a.pinRank !== b.pinRank) return a.pinRank === null ? 1 : b.pinRank === null ? -1 : a.pinRank - b.pinRank;
      const d = (demand.get(b.id) ?? 0) - (demand.get(a.id) ?? 0);
      if (d !== 0) return d;
      const fa = fallback(a);
      const fb = fallback(b);
      for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) return fa[i] - fb[i];
      return a.id.localeCompare(b.id);
    })
    .slice(0, limit)
    .map((f) => f.id);
}

/** A small deterministic PRNG (mulberry32) seeded by a string, so a day's picks are stable and cacheable. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The value at fraction p (0..1) of sorted numbers. */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

/**
 * "גלו עוד": parts worth a look that aren't on the most wanted list. In stock, with a photo,
 * not an accessory, priced in the vendor's middle range (40th–85th percentile), shuffled by
 * `seed` (the day and the vendor), so the strip changes daily and stays the same all day.
 */
export function pickDiscovery(families: FamilySignals[], exclude: Iterable<string>, seed: string, count: number): string[] {
  const skip = new Set(exclude);
  const prices = families.flatMap((f) => (f.priceUsd !== null && f.priceUsd > 0 ? [f.priceUsd] : [])).sort((a, b) => a - b);
  const low = quantile(prices, 0.4);
  const high = quantile(prices, 0.85);
  const pool = families
    .filter((f) => !skip.has(f.id) && f.available && f.hasImage && !f.accessory && f.priceUsd !== null && f.priceUsd >= low && f.priceUsd <= high)
    .map((f) => f.id)
    .sort();
  const random = seededRandom(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/**
 * Product handles in a store's "best selling" collection page, best first. The page's menus and
 * footer link products too, so the same page sorted by title is compared: what both pages share
 * at the start (the menu) and at the end (the footer) is dropped, and what's left is the grid.
 */
export function bestSellerHandles(bestSellingHtml: string, titleSortedHtml: string): string[] {
  const links = diffHandles(LINK_HANDLE, bestSellingHtml, titleSortedHtml);
  if (links.length >= 5) return links;
  // A store whose grid is drawn in the browser (AndyMark) has no product links in the page, only
  // its products' data as JSON ("handle":"…"), in the same order.
  const json = diffHandles(JSON_HANDLE, bestSellingHtml, titleSortedHtml);
  return json.length > links.length ? json : links;
}

const LINK_HANDLE = /\/products\/([a-z0-9][a-z0-9-]*)/gi;
const JSON_HANDLE = /"handle":"([a-z0-9][a-z0-9-]*)"/gi;

/** The handles where the two pages differ (the grid), without the menu and footer they share. */
function diffHandles(pattern: RegExp, bestSellingHtml: string, titleSortedHtml: string): string[] {
  const handles = (html: string) => [...html.matchAll(pattern)].map((m) => m[1].toLowerCase());
  const a = handles(bestSellingHtml);
  const b = handles(titleSortedHtml);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  return [...new Set(a.slice(start, a.length - end))];
}

/** Lists taken in turns (one from each, then the next round), without repeating an item. */
export function interleave<T>(lists: T[][], key: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i];
      if (item === undefined || seen.has(key(item))) continue;
      seen.add(key(item));
      out.push(item);
    }
  }
  return out;
}

/** How many pages of `size` a pool fills (at least 1, so an endless strip always has a page). */
export function pageCount(poolSize: number, size: number): number {
  return Math.max(1, Math.ceil(poolSize / size));
}

/**
 * Page `page` of an endless strip over `pool`: any integer, wrapping around both ways, so items
 * repeat only after the whole pool has been shown. The last page is filled from the start.
 */
export function wrappedPage<T>(pool: T[], page: number, size: number): T[] {
  if (pool.length === 0) return [];
  const pages = pageCount(pool.length, size);
  const p = ((page % pages) + pages) % pages;
  const start = p * size;
  return Array.from({ length: Math.min(size, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
}
