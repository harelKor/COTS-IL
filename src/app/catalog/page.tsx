import type { Metadata } from "next";
import { markupText } from "@/domain/pricing";
import { getSiteFacts } from "@/lib/settings";
import { Suspense, ViewTransition } from "react";
import { CatalogBrowser } from "@/components/catalog-browser";
import { CategoryGroups } from "@/components/category-groups";
import { CardGridSkeleton, Loading } from "@/components/skeleton";
import { getFacets, getSpecFacets, getSupplierCounts, resolveSearch, searchCards } from "@/lib/catalog";
import { Ltr } from "@/components/ltr";
import { catalogHref, hasFilters, PAGE_SIZE, parseFilters } from "@/lib/catalog-filters";

/** The page's name: the category, or the search. */
async function catalogTitle(filters: ReturnType<typeof parseFilters>) {
  if (filters.q) return `חיפוש: ${filters.q}`;
  if (!filters.category) return "קטלוג";
  const { categories } = await getFacets();
  return categories.find((c) => c.slug === filters.category)?.name ?? "קטלוג";
}

/**
 * Titled by category or search. Only /catalog and /catalog?category=… are pages for search
 * engines: a search, spec filter, supplier, sort or view is a variation of one of them.
 */
export async function generateMetadata({ searchParams }: PageProps<"/catalog">): Promise<Metadata> {
  const filters = parseFilters(await searchParams);
  const variation = !!(filters.q || hasFilters(filters) || filters.sort !== "relevance" || filters.view !== "grid" || filters.page > 1);
  const title = await catalogTitle(filters);
  return {
    title,
    description: `${title}: חלקים לקבוצות FRC ו-FTC מ-AndyMark, WCP, CTRE ומ-The Thrifty Bot, במחירים בשקלים, עם הצעת מחיר מהספק הישראלי.`,
    alternates: { canonical: catalogHref({ category: filters.category }) },
    ...(variation ? { robots: { index: false, follow: true } } : {}),
  };
}

async function CatalogTitle({ searchParams }: PageProps<"/catalog">) {
  const filters = parseFilters(await searchParams);
  return <h1 className="text-title font-semibold">{filters.q ? <>חיפוש: <Ltr>{filters.q}</Ltr></> : await catalogTitle(filters)}</h1>;
}

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 30;

/** One tap per category, in a row that scrolls sideways on phones. */
async function CategoryChips({ searchParams }: PageProps<"/catalog">) {
  const filters = parseFilters(await searchParams);
  const { categories } = await getFacets();
  return <CategoryGroups categories={categories.map((c) => ({ slug: c.slug, name: c.name, count: c.count }))} category={filters.category} q={filters.q} />;
}

/** Pages of cards the server renders at most. */
const MAX_SERVER_PAGES = 2;

async function Results({ searchParams }: PageProps<"/catalog">) {
  const filters = parseFilters(await searchParams);
  // A typo ("beraing") searches the closest catalog word instead; the box keeps what was typed.
  const query = await resolveSearch(filters.q);
  const searched = { ...filters, q: query };
  const [{ cards, total }, facets, suppliers, { suppliers: allSuppliers, categories }] = await Promise.all([
    // Up to the page in the URL, so "back" from a family page lands near where it was, but
    // never more than two pages on the server: scrolling loads the rest from /api/catalog.
    searchCards(searched, 0, Math.min(filters.page, MAX_SERVER_PAGES) * PAGE_SIZE),
    getSpecFacets(searched),
    getSupplierCounts(searched),
    getFacets(),
  ]);
  // A chosen supplier with nothing here still shows, so it can be cleared.
  const chosen = allSuppliers.find((s) => s.code === filters.supplier);
  const shownSuppliers = chosen && !suppliers.some((s) => s.code === chosen.code) ? [...suppliers, { ...chosen, count: 0 }] : suppliers;

  return (
    <CatalogBrowser
      filters={filters}
      total={total}
      cards={cards}
      facets={facets}
      suppliers={shownSuppliers.map((s) => ({ code: s.code, name: s.name, count: s.count }))}
      categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
    />
  );
}

/** How the ₪ prices are made, with the admin's multiplier (cached under `settings`). */
async function PriceLine() {
  const { markupRange } = await getSiteFacts();
  return (
    <p className="text-center text-caption text-muted">
      מחיר הספק בדולרים לפי השער היציג של בנק ישראל, כפול <bdi dir="ltr">{markupText(markupRange)}</bdi>. משלוח בישראל מתומחר בהצעת המחיר.
    </p>
  );
}

export default function CatalogPage(props: PageProps<"/catalog">) {
  return (
    // A little wider than other pages on a desktop, for four columns beside the filters.
    <div className="flex flex-col gap-4 xl:-mx-10 2xl:-mx-24">
      <Suspense fallback={<h1 className="text-title font-semibold">קטלוג</h1>}>
        <CatalogTitle {...props} />
      </Suspense>
      <Suspense fallback={<div className="skeleton h-11 w-full rounded-full" aria-hidden />}>
        <CategoryChips {...props} />
      </Suspense>
      <Suspense
        fallback={
          <ViewTransition exit="page-exit" default="none">
            <Loading>
              <div className="flex flex-col gap-5">
                <div className="skeleton h-11 w-2/3 rounded-full" />
                <CardGridSkeleton count={12} />
              </div>
            </Loading>
          </ViewTransition>
        }
      >
        <ViewTransition enter="reveal" default="none">
          <Results {...props} />
        </ViewTransition>
      </Suspense>
      <PriceLine />
    </div>
  );
}
