import { type NextRequest } from "next/server";
import { familyHref } from "@/components/catalog";
import { priceIls } from "@/domain/pricing";
import { quickSearch } from "@/lib/catalog";
import { parseQuickQuery, tokenIsPartName } from "@/lib/quick-query";

export type SearchResult = {
  id: string;
  href: string;
  title: string;
  image: string | null;
  supplierName: string;
  priceIls: number | null;
  fromPrice: boolean;
  available: boolean | null;
  variantCount: number;
  /** Set when the family is a single part, so the panel can add it directly (the cheapest in stock). */
  variantId: string | null;
  sku: string | null;
};

export type SearchResponse = { results: SearchResult[]; qty: number };

/**
 * Instant results for the search panel. Public, like the catalog. A trailing
 * "x4" is a quantity, unless the results show it's part of a name ("Kraken X60").
 */
export async function GET(request: NextRequest) {
  const parsed = parseQuickQuery(request.nextUrl.searchParams.get("q")?.slice(0, 100) ?? "");
  if (parsed.q.length < 2) return Response.json({ results: [], qty: 1 } satisfies SearchResponse);

  let rows = await quickSearch(parsed.q);
  let qty = parsed.qty;
  if (parsed.token && tokenIsPartName(parsed.token, rows.map((r) => r.title))) {
    rows = await quickSearch(parsed.text);
    qty = 1;
  }
  const results: SearchResult[] = rows.map((r) => {
    const low = priceIls(r.minPriceUsd);
    const high = priceIls(r.maxPriceUsd);
    return {
      id: r.id,
      href: familyHref(r.slug),
      title: r.title,
      image: r.image,
      supplierName: r.supplierNames.join(" · "),
      priceIls: low,
      fromPrice: high !== null && high !== low,
      available: r.available,
      variantCount: r.variantCount,
      variantId: r.onlyVariant?.id ?? null,
      sku: r.onlyVariant?.sku ?? null,
    };
  });
  return Response.json({ results, qty } satisfies SearchResponse);
}
