import { rankKey, type Rankable } from "./catalog-rank";
import { englishQuery, searchTerms } from "./search-query";

/**
 * How a search orders its results (audit C-09, Nov 14, 2026). `searchQuery` in src/lib/catalog.ts
 * applies the same steps in SQL, then the title and the id, so the order is one and the same on
 * every render and every page.
 *
 * 1. a variant's SKU is the search;
 * 2. the title is the search;
 * 3. a search of two words or more that the title starts with ("kraken x60" → "Kraken X60 …");
 * 4. in stock ahead of out of stock ("neo motor": NEO motors before out-of-stock swerve modules);
 * 5. the title holds every word (not only the description);
 * 6. a real category ahead of "other";
 * 7. the part itself ahead of its screws, spacers and covers;
 * 8. main items (from MAIN_ITEM_MIN_USD, or a line of 3+ sizes) ahead of cheap single bits;
 * 9. the closest title (Postgres trigram similarity): "Kraken X60 Powered by TalonFX" before
 *    "Kraken Spline Bore Aluminum HTD Pulleys", "Flanged Bearing" before "Bearing Retention Plates".
 *
 * One word doesn't get step 3: "bearing" would put "Bearing Retention and Mount Plates" ahead of
 * the bearings, and "gear" "Gear-Driven Turret" ahead of the gears.
 */
export type SearchRankable = Rankable & { skuMatch?: boolean };

/** The phrase a title must start with for step 3, or null for a one-word search. */
export function prefixPhrase(q: string): string | null {
  const english = englishQuery(q);
  return searchTerms(q).length >= 2 && english ? english : null;
}

/** The steps before similarity, lowest first (each 0 or 1). */
export function searchRankKey(f: SearchRankable, q: string): number[] {
  const terms = searchTerms(q);
  const title = f.title.toLowerCase().trim();
  const english = englishQuery(q);
  const phrase = prefixPhrase(q);
  const inTitle = terms.length > 0 && terms.every((t) => t.alternatives.some((a) => title.includes(a)));
  const exact = title === q.trim().toLowerCase() || (english !== "" && title === english);
  const prefix = phrase !== null && title.startsWith(phrase);
  const [unavailable, accessory, minor] = rankKey(f);
  return [
    f.skuMatch ? 0 : 1,
    exact ? 0 : 1,
    prefix ? 0 : 1,
    unavailable,
    inTitle ? 0 : 1,
    (f.categorySlug ?? "other") === "other" ? 1 : 0,
    accessory,
    minor,
  ];
}

/** Postgres pg_trgm's trigrams: each run of letters and digits, lowercased, padded "  word ". */
function trigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm's `similarity(a, b)`: shared trigrams over all of them, 0 to 1. */
export function trigramSimilarity(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

/** Sorts search results as the catalog does: `searchRankKey`, then the closest title, then the title. */
export function rankSearch<T extends SearchRankable>(rows: T[], q: string): T[] {
  const english = englishQuery(q) || q;
  const keyed = rows.map((row) => ({ row, key: searchRankKey(row, q), sim: trigramSimilarity(row.title, english) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
    return b.sim - a.sim || a.row.title.localeCompare(b.row.title);
  });
  return keyed.map((k) => k.row);
}
