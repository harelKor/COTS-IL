export const PAGE_SIZE = 24;

export const SORTS = ["relevance", "price-asc", "price-desc", "title"] as const;
export type Sort = (typeof SORTS)[number];

export type CatalogFilters = {
  q: string;
  category: string;
  supplier: string;
  program: "FRC" | "FTC" | "";
  availableOnly: boolean;
  sort: Sort;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Reads filters from the URL. Anything unrecognized falls back to the default rather than failing. */
export function parseFilters(params: RawParams): CatalogFilters {
  const program = single(params.program);
  const sort = single(params.sort) as Sort;
  const page = Number(single(params.page));
  return {
    q: single(params.q).slice(0, 100),
    category: single(params.category),
    supplier: single(params.supplier),
    program: program === "FRC" || program === "FTC" ? program : "",
    availableOnly: single(params.available) === "1",
    sort: SORTS.includes(sort) ? sort : "relevance",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Builds a catalog link, leaving out defaults so URLs stay short and shareable. */
export function catalogHref(filters: Partial<CatalogFilters>): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.supplier) params.set("supplier", filters.supplier);
  if (filters.program) params.set("program", filters.program);
  if (filters.availableOnly) params.set("available", "1");
  if (filters.sort && filters.sort !== "relevance") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

/** Turns a search into ILIKE patterns, one per word, with wildcards in the input taken literally. */
export function searchPatterns(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((term) => `%${term.replace(/[\\%_]/g, "\\$&")}%`);
}
