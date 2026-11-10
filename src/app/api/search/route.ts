import { type NextRequest } from "next/server";
import { familyHref } from "@/components/catalog";
import { usdIlsRate } from "@/lib/fx";
import { priceIls } from "@/domain/pricing";
import { quickSearch } from "@/lib/catalog";
import { cachedJson } from "@/lib/cache-headers";
import { normalizeSearch, parseQuickQuery, tokenIsPartName } from "@/lib/quick-query";

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 15;

export type SearchResult = {
  id: string;
  href: string;
  title: string;
  image: string | null;
  supplierName: string;
  priceIls: number | null;
  maxPriceIls: number | null;
  fromPrice: boolean;
  available: boolean | null;
  variantCount: number;
  /** Options to choose on the row (the family card's chips), when there is no single part to add. */
  optionKeys: string[];
  checkedAt: string;
  /**
   * The variant "+" adds: the exact SKU searched for, or the family's only part (the
   * cheapest in stock). Null when the family has options to choose.
   */
  variantId: string | null;
  sku: string | null;
};

export type SearchResponse = {
  results: SearchResult[];
  /** The search text the server used, without the quantity (and with a typo fixed, if it was). */
  q: string;
  qty: number;
  /** Set when a typo was fixed: what was searched instead ("kraken x60" for "krakn x60"). */
  corrected: string | null;
};

/**
 * Instant results for the search panel. Public, like the catalog. A trailing
 * "x4" is a quantity, unless the results show it's part of a name ("Kraken X60").
 */
export async function GET(request: NextRequest) {
  const parsed = parseQuickQuery(normalizeSearch(request.nextUrl.searchParams.get("q") ?? ""));
  if (parsed.q.length < 2) return cachedJson({ results: [], q: parsed.q, qty: 1, corrected: null } satisfies SearchResponse);

  let found = await quickSearch(parsed.q);
  let q = parsed.q;
  let qty = parsed.qty;
  if (parsed.token && tokenIsPartName(parsed.token, found.rows.map((r) => r.title))) {
    found = await quickSearch(parsed.text);
    q = parsed.text;
    qty = 1;
  }
  const rows = found.rows;
  const rate = await usdIlsRate();
  const results: SearchResult[] = rows.map((r) => {
    const exact = r.matchedVariant ? priceIls(r.matchedVariant.priceUsd, rate) : null;
    const low = exact ?? priceIls(r.minPriceUsd, rate);
    const high = exact ?? priceIls(r.maxPriceUsd, rate);
    return {
      id: r.id,
      href: familyHref(r.slug, r.matchedVariant?.sku ?? null),
      title: r.title,
      image: r.image,
      supplierName: r.supplierNames.join(", "),
      priceIls: low,
      maxPriceIls: high,
      fromPrice: high !== null && high !== low,
      available: r.available,
      variantCount: r.variantCount,
      optionKeys: r.optionKeys,
      checkedAt: new Date(r.lastSeenAt).toISOString(),
      variantId: r.matchedVariant?.id ?? r.onlyVariant?.id ?? null,
      sku: r.matchedVariant?.sku ?? r.onlyVariant?.sku ?? null,
    };
  });
  return cachedJson({ results, q, qty, corrected: found.query !== q ? found.query : null } satisfies SearchResponse);
}
