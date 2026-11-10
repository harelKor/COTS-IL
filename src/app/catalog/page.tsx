import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import { CatalogBrowser } from "@/components/catalog-browser";
import { CardGridSkeleton, Loading } from "@/components/skeleton";
import { getFacets, getSpecFacets, getSupplierCounts, searchCards } from "@/lib/catalog";
import { catalogHref, catalogQuery, PAGE_SIZE, parseFilters } from "@/lib/catalog-filters";

export const metadata: Metadata = { title: "קטלוג" };

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 30;

/** One tap per category, in a row that scrolls sideways on phones. */
async function CategoryChips({ searchParams }: PageProps<"/catalog">) {
  const filters = parseFilters(await searchParams);
  const { categories } = await getFacets();
  const chip = (on: boolean) =>
    `flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] whitespace-nowrap transition-colors ${
      on ? "bg-foreground text-background" : "bg-subtle text-foreground hover:bg-line/60"
    }`;
  return (
    <nav aria-label="קטגוריות" className="no-scrollbar scroll-fade-x -mx-6 flex gap-2 overflow-x-auto px-6 pb-1 md:-mx-12 md:px-12">
      <Link href={catalogHref({ q: filters.q })} className={chip(!filters.category)}>
        הכל
      </Link>
      {categories.map((c) => (
        <Link key={c.slug} href={catalogHref({ q: filters.q, category: c.slug })} className={chip(filters.category === c.slug)} aria-current={filters.category === c.slug ? "page" : undefined}>
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

/** Pages of cards the server renders at most. */
const MAX_SERVER_PAGES = 2;

async function Results({ searchParams }: PageProps<"/catalog">) {
  const filters = parseFilters(await searchParams);
  const [{ cards, total }, facets, suppliers, { suppliers: allSuppliers }] = await Promise.all([
    // Up to the page in the URL, so "back" from a family page lands near where it was, but
    // never more than two pages on the server: scrolling loads the rest from /api/catalog.
    searchCards(filters, 0, Math.min(filters.page, MAX_SERVER_PAGES) * PAGE_SIZE),
    getSpecFacets(filters),
    getSupplierCounts(filters),
    getFacets(),
  ]);
  // A chosen supplier with nothing here still shows, so it can be cleared.
  const chosen = allSuppliers.find((s) => s.code === filters.supplier);
  const shownSuppliers = chosen && !suppliers.some((s) => s.code === chosen.code) ? [...suppliers, { ...chosen, count: 0 }] : suppliers;

  return (
    <CatalogBrowser
      // Changing a filter starts the list again; switching view or loading more doesn't.
      key={catalogQuery({ ...filters, page: 1, view: "grid" })}
      filters={filters}
      total={total}
      cards={cards}
      facets={facets}
      suppliers={shownSuppliers.map((s) => ({ code: s.code, name: s.name, count: s.count }))}
    />
  );
}

export default function CatalogPage(props: PageProps<"/catalog">) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-title font-semibold">קטלוג</h1>
        <p className="text-caption text-muted">מחיר הספק בדולרים לפי השער היציג של בנק ישראל, בלי תוספת. משלוח בישראל מתומחר בהצעת המחיר.</p>
      </div>
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
    </div>
  );
}
