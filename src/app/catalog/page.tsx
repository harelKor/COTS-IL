import type { Metadata } from "next";
import { markupText } from "@/domain/pricing";
import { getSettings, getSiteFacts } from "@/lib/settings";
import { Suspense, ViewTransition } from "react";
import { CatalogBrowser } from "@/components/catalog-browser";
import { CardGridSkeleton, Loading } from "@/components/skeleton";
import { crumbTrail } from "@/domain/catalog-nav";
import { getCategoryCounts, getControlCounts, getFacets, getSpecFacets, getSupplierCounts, resolveSearch, searchCards } from "@/lib/catalog";
import { homeVendorOrder, vendorNameList } from "@/domain/vendors";
import { siteUrl } from "@/lib/site-url";
import { catalogHref, hasFilters, PAGE_SIZE, parseFilters } from "@/lib/catalog-filters";

/** The page's name: the category, or the search. */
async function catalogTitle(filters: ReturnType<typeof parseFilters>) {
  if (filters.q) return `חיפוש: ${filters.q}`;
  if (filters.category) {
    const { categories } = await getFacets();
    return categories.find((c) => c.slug === filters.category)?.name ?? "קטלוג";
  }
  if (filters.group) return (await getSettings()).content.categoryGroups.find((g) => g.id === filters.group)?.name ?? "קטלוג";
  return "קטלוג";
}

/**
 * Titled by category or search. Only /catalog and /catalog?category=… are pages for search
 * engines: a search, spec filter, supplier, sort or view is a variation of one of them.
 */
export async function generateMetadata({ searchParams }: PageProps<"/catalog">): Promise<Metadata> {
  const filters = parseFilters(await searchParams);
  const variation = !!(filters.q || filters.group || hasFilters(filters) || filters.sort !== "relevance" || filters.view !== "grid" || filters.page > 1);
  const [title, { suppliers }] = await Promise.all([catalogTitle(filters), getFacets()]);
  return {
    title,
    description: `${title}: חלקים לקבוצות FRC ו-FTC מ-${vendorNameList(suppliers.map((s) => s.name))}, במחירים בשקלים, עם הצעת מחיר מהספק הישראלי.`,
    alternates: { canonical: catalogHref({ category: filters.category }) },
    ...(variation ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 30;

/** Pages of cards the server renders at most. */
const MAX_SERVER_PAGES = 2;

/** The breadcrumb as schema.org BreadcrumbList, the same trail the page shows (CatalogHeading). */
function breadcrumbJsonLd(trail: ReturnType<typeof crumbTrail>) {
  const site = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${site}${catalogHref({ group: c.to.category ? "" : c.to.group, category: c.to.category })}`,
    })),
  };
}

async function Results({ searchParams }: PageProps<"/catalog">) {
  const filters = parseFilters(await searchParams);
  // A typo ("beraing") searches the closest catalog word instead; the box keeps what was typed.
  const query = await resolveSearch(filters.q);
  const searched = { ...filters, q: query };
  const [{ cards, total }, facets, supplierCounts, { suppliers: allSuppliers, categories }, inView, counts, { content }] = await Promise.all([
    // Up to the page in the URL, so "back" from a family page lands near where it was, but
    // never more than two pages on the server: scrolling loads the rest from /api/catalog.
    searchCards(searched, 0, Math.min(filters.page, MAX_SERVER_PAGES) * PAGE_SIZE),
    getSpecFacets(searched),
    getSupplierCounts(searched),
    getFacets(),
    // The bar's, tiles' and pills' numbers: this search, the vendors, program, stock and price, in any
    // category. Not the spec filters: they belong to a category, and leaving it drops them (CF3).
    getCategoryCounts({ ...searched, specs: {}, ranges: {} }),
    // FRC, FTC, in stock and the ₪ range, each under the other filters (CF2).
    getControlCounts(searched),
    getSettings(),
  ]);
  // Every vendor, always in the home page's order (CF3): the strip never reorders or drops one.
  const inStrip = new Map(supplierCounts.map((s) => [s.code, s.count]));
  const trail = crumbTrail(filters, categories.map((c) => ({ ...c, group: c.group ?? "" })), content.categoryGroups);

  return (
    <>
      {/* The trail as data for search engines; the page shows it as the breadcrumb. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(trail)).replace(/</g, "\\u003c") }} />
      <CatalogBrowser
        filters={filters}
        total={total}
        cards={cards}
        facets={facets}
        counts={counts}
        suppliers={homeVendorOrder(allSuppliers).map((s) => ({
          code: s.code,
          name: s.name,
          count: inStrip.get(s.code) ?? 0,
          logoUrl: s.logoUrl,
          accentColor: s.accentColor,
          accentColor2: s.accentColor2,
        }))}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name, group: c.group ?? "", images: c.images, count: inView[c.slug] ?? 0 }))}
      />
    </>
  );
}

/** How the ₪ prices are made, with the admin's multiplier (cached under `settings`). */
async function PriceLine() {
  const { markupRange } = await getSiteFacts();
  return (
    <p className="text-center text-caption text-muted">
      מחיר הספק בדולרים לפי השער היציג של בנק ישראל, כפול <bdi dir="ltr">{markupText(markupRange)}</bdi>, כולל מע״מ. משלוח בישראל מתומחר בהצעת המחיר.
    </p>
  );
}

export default function CatalogPage(props: PageProps<"/catalog">) {
  return (
    // As wide as the header's content, never closer to the window's edge: the grid is full width now.
    <div className="flex flex-col gap-4">
      <Suspense
        fallback={
          <ViewTransition exit="page-exit" default="none">
            <Loading>
              {/* About the strip, the bar and the title, so nothing jumps when the results stream in. */}
              <div className="flex flex-col gap-3">
                <div className="skeleton h-16 w-full rounded-2xl" />
                <div className="skeleton h-14 w-full rounded-2xl" />
                <div className="skeleton h-10 w-1/3 rounded-full" />
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
