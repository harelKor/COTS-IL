import { type NextRequest } from "next/server";
import { searchCards, type CardFamily } from "@/lib/catalog";
import { PAGE_SIZE, parseFilters } from "@/lib/catalog-filters";

export type CatalogPage = { cards: CardFamily[]; total: number };

/** One more page of catalog cards for infinite scroll, with the same filters as the page URL. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) raw[key] = params.getAll(key);
  const filters = parseFilters(raw);
  const page = await searchCards({ ...filters, page: 1 }, (filters.page - 1) * PAGE_SIZE, PAGE_SIZE);
  return Response.json(page satisfies CatalogPage);
}
