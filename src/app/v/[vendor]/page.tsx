import { ChevronLeft, Search } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { CatalogBrowser } from "@/components/catalog-browser";
import { CategoryGroups } from "@/components/category-groups";
import { GroupBoxes } from "@/components/group-boxes";
import { DiscoveryStrip } from "@/components/discovery-strip";
import { FamilyCard } from "@/components/family-card";
import { Ltr } from "@/components/ltr";
import { PriceNote } from "@/components/price-note";
import { CardGridSkeleton, Loading, TileGridSkeleton } from "@/components/skeleton";
import { isStoreFront, vendorBlurb, vendorHref } from "@/domain/vendors";
import { getSpecFacets, getVendorDiscovery, getVendorPopular, getVendorStore, resolveSearch, searchCards } from "@/lib/catalog";
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
    description: `${store.name} בשקלים לקבוצות FRC ו-FTC: ${vendorBlurb(store.code) ?? "חלקים לרובוט"}, עם הצעת מחיר מהספק הישראלי.`,
    alternates: { canonical: vendorHref(store.code, { category: filters.category }) },
    ...(filters.q || hasFilters(filters) || filters.page > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

function Breadcrumb({ store, here }: { store: Store; here?: React.ReactNode }) {
  return (
    <nav aria-label="ניווט" className="-mb-2 text-caption text-muted">
      <ol className="flex min-w-0 items-center gap-1">
        <li className="shrink-0">
          <Link href="/#vendors" className="flex min-h-11 items-center hover:text-brand">
            כל הספקים
          </Link>
        </li>
        <li className="flex shrink-0 items-center gap-1">
          <ChevronLeft size={14} aria-hidden />
          {here ? (
            <Link href={vendorHref(store.code)} className="flex min-h-11 items-center hover:text-brand">
              <Ltr>{store.name}</Ltr>
            </Link>
          ) : (
            <span aria-current="page" className="text-foreground">
              <Ltr>{store.name}</Ltr>
            </span>
          )}
        </li>
        {here && (
          <li className="flex min-w-0 items-center gap-1">
            <ChevronLeft size={14} aria-hidden className="shrink-0" />
            <span aria-current="page" className="truncate text-foreground">
              {here}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}

/** Search inside this vendor only: a GET to the store, so it works before the page hydrates. */
function StoreSearch({ store, q }: { store: Store; q: string }) {
  return (
    <Form action={vendorHref(store.code)} role="search" className="relative w-full lg:max-w-md">
      <label htmlFor="store-q" className="sr-only">
        חיפוש ב-{store.name}
      </label>
      <Search size={20} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted" />
      <input
        id="store-q"
        name="q"
        type="search"
        defaultValue={q}
        enterKeyHint="search"
        placeholder={`חיפוש ב-${store.name}`}
        className="h-11 w-full rounded-xl bg-subtle ps-10 pe-4 text-body outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
    </Form>
  );
}

/** The vendor's most wanted parts, large, each with its one-tap "+". */
async function Popular({ store }: { store: Store }) {
  const cards = await getVendorPopular(store.code, 8);
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="popular">
      <h2 id="popular" className="mb-4 text-section font-semibold">
        הכי מבוקשים ב-<Ltr>{store.name}</Ltr>
      </h2>
      <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {cards.map((c, i) => (
          <FamilyCard key={c.id} family={c} eager={i < 4} glow />
        ))}
      </ul>
    </section>
  );
}

/** Today's less common picks from this vendor. */
async function Discover({ store }: { store: Store }) {
  return <DiscoveryStrip cards={await getVendorDiscovery(store.code, 10)} note={`כל יום מבחר אחר מ-${store.name}, מעבר למבוקשים`} />;
}

function StoreFront({ store }: { store: Store }) {
  const blurb = vendorBlurb(store.code);
  return (
    <>
      <Breadcrumb store={store} />
      <header className={`glow-box accent-${store.code} flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6`}>
        <div className="flex flex-col items-start gap-2">
          <h1 className="text-title font-semibold">
            <Ltr className="text-brand-gradient">{store.name}</Ltr>
          </h1>
          {blurb && <p className="text-callout text-muted">{blurb}</p>}
          <span className="rounded-full bg-brand-soft/70 px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
            {store.count.toLocaleString("he-IL")} מוצרים
          </span>
        </div>
        <StoreSearch store={store} q="" />
      </header>
      <Suspense
        fallback={
          <Loading>
            <CardGridSkeleton count={8} />
          </Loading>
        }
      >
        <Popular store={store} />
      </Suspense>
      <Suspense>
        <Discover store={store} />
      </Suspense>
      <section aria-labelledby="all">
        <h2 id="all" className="mb-4 text-section font-semibold">
          כל המוצרים של <Ltr>{store.name}</Ltr>
        </h2>
        <GroupBoxes categories={store.categories.map((c) => ({ ...c, href: vendorHref(store.code, { category: c.slug }) }))} />
      </section>
    </>
  );
}

/** Pages of cards the server renders at most; scrolling loads the rest from /api/catalog. */
const MAX_SERVER_PAGES = 2;

async function Results({ store, filters }: { store: Store; filters: CatalogFilters }) {
  const query = await resolveSearch(filters.q);
  const searched = { ...filters, q: query };
  const [{ cards, total }, facets] = await Promise.all([
    searchCards(searched, 0, Math.min(filters.page, MAX_SERVER_PAGES) * PAGE_SIZE),
    getSpecFacets(searched),
  ]);
  return (
    <CatalogBrowser
      vendor={store.code}
      filters={filters}
      total={total}
      cards={cards}
      facets={facets}
      suppliers={[{ code: store.code, name: store.name, count: total }]}
      categories={store.categories.map((c) => ({ slug: c.slug, name: c.name }))}
    />
  );
}

function StoreResults({ store, filters }: { store: Store; filters: CatalogFilters }) {
  const category = store.categories.find((c) => c.slug === filters.category)?.name;
  const here = filters.q ? (
    <>
      חיפוש: <Ltr>{filters.q}</Ltr>
    </>
  ) : (
    (category ?? "מוצרים")
  );
  return (
    <div className="flex flex-col gap-4 xl:-mx-10 2xl:-mx-24">
      <Breadcrumb store={store} here={here} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-title font-semibold">
          <Ltr>{store.name}</Ltr>: {here}
        </h1>
        <StoreSearch store={store} q={filters.q} />
      </div>
      <CategoryGroups vendor={store.code} categories={store.categories} category={filters.category} q={filters.q} />
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

async function VendorStore({ params, searchParams }: Props) {
  const { vendor } = await params;
  const store = await getVendorStore(vendor);
  if (!store) notFound();
  // The vendor is the path: a `?supplier=` in the URL can't switch the store.
  const filters = { ...parseFilters(await searchParams), supplier: store.code };
  return isStoreFront(filters) ? <StoreFront store={store} /> : <StoreResults store={store} filters={filters} />;
}

export default function VendorPage(props: Props) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense
        fallback={
          <Loading>
            <div className="flex flex-col gap-6">
              <div className="skeleton h-36 w-full rounded-card" />
              <TileGridSkeleton />
            </div>
          </Loading>
        }
      >
        <VendorStore {...props} />
      </Suspense>
      <PriceNote />
    </div>
  );
}
