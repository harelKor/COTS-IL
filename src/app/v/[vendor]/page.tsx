import { ChevronLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { CatalogBrowser } from "@/components/catalog-browser";
import { CategoryBar } from "@/components/category-bar";
import { StoreGroupCards } from "@/components/store-groups";
import { DiscoveryStrip } from "@/components/discovery-strip";
import { PopularSection } from "@/components/popular-section";
import { FamilyCard } from "@/components/family-card";
import { Ltr } from "@/components/ltr";
import { PriceNote } from "@/components/price-note";
import { VendorMark } from "@/components/vendor-mark";
import { StoreSearch } from "@/components/store-search";
import { CardGridSkeleton, Loading, TileGridSkeleton } from "@/components/skeleton";
import { aliveStyle } from "@/domain/alive";
import { isStoreFront, vendorBlurb, vendorHref, vendorTheme } from "@/domain/vendors";
import { getCategoryCounts, getControlCounts, getDiscoveryPage, getSpecFacets, getVendorPopular, getVendors, getVendorStore, resolveSearch, searchCards } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { hasFilters, PAGE_SIZE, parseFilters, type CatalogFilters } from "@/lib/catalog-filters";

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 30;

type Props = PageProps<"/v/[vendor]">;
type Store = NonNullable<Awaited<ReturnType<typeof getVendorStore>>>;

/** The store's front page and its categories are for search engines; a search or filter is a variation. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { vendor } = await params;
  const store = await getVendorStore(vendor);
  if (!store) return { title: "הספק לא נמצא" };
  const filters = parseFilters(await searchParams);
  const category = store.categories.find((c) => c.slug === filters.category)?.name;
  const title = filters.q ? `חיפוש ב-${store.name}: ${filters.q}` : category ? `${store.name}: ${category}` : `החנות של ${store.name}`;
  return {
    title,
    description: `${store.name} בשקלים לקבוצות FRC ו-FTC: ${vendorBlurb(store.categories.filter((c) => c.slug !== "other")) ?? "חלקים לרובוט"}, עם הצעת מחיר מהספק הישראלי.`,
    alternates: { canonical: vendorHref(store.code, { category: filters.category }) },
    ...(filters.q || filters.group || hasFilters(filters) || filters.page > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

function Breadcrumb({ store, here, className = "-mb-2" }: { store: Store; here?: React.ReactNode; className?: string }) {
  const current = "flex items-center gap-2 font-medium text-foreground";
  const dot = <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />;
  return (
    <nav aria-label="ניווט" className={`${className} text-caption text-muted`}>
      <ol className="flex min-w-0 items-center gap-1">
        <li className="shrink-0">
          <Link href="/#vendors" className="flex min-h-11 items-center hover:text-foreground">
            כל הספקים
          </Link>
        </li>
        <li className="flex shrink-0 items-center gap-1">
          <ChevronLeft size={14} aria-hidden />
          {here ? (
            <Link href={vendorHref(store.code)} className="flex min-h-11 items-center hover:text-foreground">
              <Ltr>{store.name}</Ltr>
            </Link>
          ) : (
            <span aria-current="page" className={current}>
              {dot}
              <Ltr>{store.name}</Ltr>
            </span>
          )}
        </li>
        {here && (
          <li className="flex min-w-0 items-center gap-1">
            <ChevronLeft size={14} aria-hidden className="shrink-0" />
            <span aria-current="page" className={`${current} min-w-0`}>
              {dot}
              <span className="truncate">{here}</span>
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}

/** The vendor's most wanted parts, large, each with its one-tap "+", nudging for attention now and then. */
async function Popular({ store }: { store: Store }) {
  const cards = await getVendorPopular(store.code, 4);
  if (cards.length === 0) return null;
  return (
    <PopularSection>
      <ul className="grid grid-cols-1 gap-3 pt-1 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {cards.map((c, i) => (
          <FamilyCard
            key={c.id}
            family={c}
            eager={i < 4}
            glow
            compact
            className="alive hot-card"
            // Out of step on purpose: each card has its own delay and rhythm.
            style={aliveStyle(c.id) as React.CSSProperties}
          />
        ))}
      </ul>
    </PopularSection>
  );
}

/** Today's less common picks from this vendor. */
async function Discover({ store }: { store: Store }) {
  const { cards, pages } = await getDiscoveryPage(store.code, 0);
  return <DiscoveryStrip cards={cards} pages={pages} vendor={store.code} note={`כל יום מבחר אחר מ-${store.name}, מעבר למבוקשים`} wideFade />;
}

/** "andymark.com" from the vendor's site address, for the link to it. */
function siteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function StoreFront({ store }: { store: Store }) {
  const blurb = vendorBlurb(store.categories.filter((c) => c.slug !== "other"));
  // The banner with the groups right under it, then the most wanted, then "גלו עוד", with room between them.
  return (
    <div className="flex flex-col gap-12 lg:gap-16">
      <div className="flex flex-col gap-3">
        {/* Pulled up toward the header, so the banner sits higher. */}
        <Breadcrumb store={store} className="-mt-6" />
        {/* The flagship header: the logo large on dark glass in the vendor's colours, the search console beside it. */}
        {/* From 1024px a two-column grid: the logo and blurb on the right; the search on the left with the count and the vendor's site under it. A short banner. */}
        <header className="store-flagship relative z-20 grid grid-cols-1 gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-8 lg:gap-y-2">
          <div className="flex min-w-0 flex-col items-start gap-1.5 lg:row-span-2">
            <h1 className="flex min-h-12 items-center">
              {store.logoUrl ? (
                <VendorMark name={store.name} logoUrl={store.logoUrl} size="hero" tone="dark" eager />
              ) : (
                <Ltr className="text-brand-gradient text-title font-semibold">{store.name}</Ltr>
              )}
            </h1>
            {blurb && <p className="store-blurb text-callout">{blurb}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:col-start-2 lg:row-start-2">
            <span className="count-pill rounded-full px-3 py-1 text-caption font-semibold tabular-nums">
              {store.count.toLocaleString("he-IL")} מוצרים
            </span>
            {/* The vendor's own site (suppliers.base_url), in a new tab. */}
            <a
              href={store.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`לאתר ${store.name} (נפתח בכרטיסייה חדשה)`}
              className="glass-pill flex min-h-11 items-center gap-2 rounded-full px-4 text-caption font-medium"
            >
              <ExternalLink size={20} strokeWidth={1.75} aria-hidden />
              <Ltr>{siteName(store.baseUrl)}</Ltr>
            </a>
          </div>
          <div className="lg:col-start-2 lg:row-start-1">
            <StoreSearch action={vendorHref(store.code)} vendor={store.code} vendorName={store.name} q="" />
          </div>
        </header>
        {/* The groups straight under the banner, with no heading: they are the store's way in. */}
        <div className="mt-3 lg:mt-5">
          <StoreGroupCards vendor={store.code} name={store.name} categories={store.categories} />
        </div>
      </div>
      <Suspense
        fallback={
          <Loading>
            <CardGridSkeleton count={4} />
          </Loading>
        }
      >
        <Popular store={store} />
      </Suspense>
      <Suspense>
        <Discover store={store} />
      </Suspense>
    </div>
  );
}

/** Pages of cards the server renders at most; scrolling loads the rest from /api/catalog. */
const MAX_SERVER_PAGES = 2;

async function Results({ store, filters }: { store: Store; filters: CatalogFilters }) {
  const query = await resolveSearch(filters.q);
  const searched = { ...filters, q: query };
  const [{ cards, total }, facets, inView, counts] = await Promise.all([
    searchCards(searched, 0, Math.min(filters.page, MAX_SERVER_PAGES) * PAGE_SIZE),
    getSpecFacets(searched),
    // The chips count what this search and these filters hold in the store.
    getCategoryCounts(searched),
    getControlCounts(searched),
  ]);
  return (
    <CatalogBrowser
      vendor={store.code}
      filters={filters}
      total={total}
      cards={cards}
      facets={facets}
      counts={counts}
      suppliers={[{ code: store.code, name: store.name, count: total }]}
      categories={store.categories.map((c) => ({ slug: c.slug, name: c.name }))}
      underVendors={
        <CategoryBar vendor={store.code} categories={store.categories.map((c) => ({ ...c, count: inView[c.slug] ?? 0 }))} category={filters.category} group={filters.group} q={filters.q} />
      }
    />
  );
}

async function StoreResults({ store, filters }: { store: Store; filters: CatalogFilters }) {
  const category = store.categories.find((c) => c.slug === filters.category)?.name;
  const group = filters.group ? (await getSettings()).content.categoryGroups.find((g) => g.id === filters.group)?.name : undefined;
  const here = filters.q ? (
    <>
      חיפוש: <Ltr>{filters.q}</Ltr>
    </>
  ) : (
    (category ?? group ?? "מוצרים")
  );
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb store={store} here={here} />
      <div className="relative z-20 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-title font-semibold">
          <Ltr>{store.name}</Ltr>: {here}
        </h1>
        <StoreSearch key={filters.q} action={vendorHref(store.code)} vendor={store.code} vendorName={store.name} q={filters.q} />
      </div>
      <Suspense
        fallback={
          <Loading>
            <CardGridSkeleton count={12} />
          </Loading>
        }
      >
        <ViewTransition enter="reveal" default="none">
          <Results store={store} filters={filters} />
        </ViewTransition>
      </Suspense>
    </div>
  );
}

/** A store's view of the URL's query: its front page, or a search or category. The only part of the store that reads it. */
async function StoreBody({ store, searchParams }: { store: Store; searchParams: Props["searchParams"] }) {
  // The vendor is the path: a `?supplier=` in the URL can't switch the store.
  const filters = { ...parseFilters(await searchParams), supplier: store.code };
  return isStoreFront(filters) ? <StoreFront store={store} /> : <StoreResults store={store} filters={filters} />;
}

/** Where the store's content will be, in the store's own colours, while the query is read. */
function StoreBodySkeleton() {
  return (
    <Loading>
      {/* A full screen tall, so the footer isn't in view and pushed down when the store streams in. */}
      <div className="flex min-h-dvh flex-col gap-6">
        <div className="skeleton h-36 w-full rounded-card" />
        <TileGridSkeleton />
      </div>
    </Loading>
  );
}

/**
 * Everything that comes from the path alone: the store, its palette and canvas. Prerendered
 * per vendor (generateStaticParams) and cached, so opening a store doesn't wait on the server
 * for it; only what the query string asks for (StoreBody) renders per request.
 */
async function VendorStore({ params, searchParams }: Props) {
  const { vendor } = await params;
  const store = await getVendorStore(vendor);
  if (!store) notFound();
  // The price note comes with the store, not under its skeleton, so nothing below jumps when it streams in.
  // The whole store wears the vendor's palette (vendorTheme): every token, card and wash on the page reads it.
  return (
    <div style={vendorTheme(store) as React.CSSProperties} className="vendor-theme relative flex flex-col gap-6">
      <div aria-hidden className="store-canvas pointer-events-none absolute -z-10" />
      <Suspense fallback={<StoreBodySkeleton />}>
        <StoreBody store={store} searchParams={searchParams} />
      </Suspense>
      <PriceNote />
    </div>
  );
}

/** Every active vendor's store is prerendered at build; one added later renders on its first visit and is kept. */
export async function generateStaticParams(): Promise<{ vendor: string }[]> {
  const vendors = await getVendors();
  // Cache Components needs at least one; AndyMark is always there.
  return vendors.length > 0 ? vendors.map((v) => ({ vendor: v.code })) : [{ vendor: "andymark" }];
}

export default function VendorPage(props: Props) {
  // Dark from the first frame (store-scene), so the page doesn't flash white while the store streams in.
  return (
    <div className="store-scene relative isolate flex flex-col gap-8">
      <Suspense fallback={<StoreBodySkeleton />}>
        <VendorStore {...props} />
      </Suspense>
    </div>
  );
}
