"use client";

import { LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CatalogPage } from "@/app/api/catalog/route";
import { rangeLabel } from "@/domain/facets";
import { optionLabel } from "@/domain/families/sort";
import { formatIls } from "@/domain/pricing";
import type { CardFamily, ControlCounts, SpecFacet } from "@/lib/catalog";
import {
  catalogHref,
  catalogQuery,
  clearPanel,
  hasFilters,
  PAGE_SIZE,
  panelFilterCount,
  setRange,
  toggleSpec,
  type CatalogFilters,
  type Sort,
} from "@/lib/catalog-filters";
import { EAGER_CARDS } from "@/lib/images";
import { vendorHref } from "@/domain/vendors";
import { FamilyCard } from "./family-card";
import { FilterFields, PanelSearch } from "./filter-panel";
import { useSiteFacts } from "./site-facts";
import { Ltr } from "./ltr";
import { rememberCatalogList } from "./back-to-list";
import { ZeroResults } from "./zero-results";
import { VendorFilter, type VendorOption } from "./vendor-filter";

type Supplier = VendorOption;

type Props = {
  filters: CatalogFilters;
  total: number;
  cards: CardFamily[];
  facets: SpecFacet[];
  /** The program, stock and price counts (getControlCounts). */
  counts: ControlCounts | null;
  suppliers: Supplier[];
  /** For the empty state: categories to try instead. */
  categories: { slug: string; name: string }[];
  /** In a vendor's store (/v/<code>): links stay in the store and there is no supplier filter. */
  vendor?: string;
  /** The category chips, under the vendor tiles (the vendor is the first and main filter). */
  underVendors?: React.ReactNode;
};

const SORT_LABELS: Record<Sort, string> = {
  relevance: "מומלץ",
  "price-asc": "מחיר: מהנמוך",
  "price-desc": "מחיר: מהגבוה",
  title: "שם",
};

const chip = (on: boolean) =>
  `flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-callout transition-colors ${
    on ? "bg-brand text-white" : "bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle"
  }`;

/** The sort, in the results bar above the grid. */
function SortSelect({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Sort)}
      aria-label="מיון"
      className="tool-chip h-11 max-w-40 shrink-0 rounded-full px-3 text-caption outline-none focus:ring-2 focus:ring-brand"
    >
      {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
        <option key={s} value={s}>
          {SORT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

const moreButton =
  "flex h-11 items-center rounded-full border border-line bg-surface px-6 text-callout font-medium text-foreground shadow-card hover:border-brand/40 hover:text-brand disabled:opacity-60";

/**
 * The catalog's filters and results. Every change applies at once (no "apply"
 * button) and lives in the URL, so a filtered view can be shared or opened in a
 * new tab. More results load with a button, and the URL keeps how many pages are
 * loaded, so "back" comes back to the same place.
 *
 * From 1024px the filters sit in a side column beside the grid that scrolls with the page (CF2,
 * the user's choice: no inner scroll); on a phone, in a full-height sheet that "סינון (N)" opens.
 * The count, sort and view are one line above the grid.
 */
export function CatalogBrowser({ filters, total, cards: first, facets, counts, suppliers, categories, vendor, underVendors }: Props) {
  const listHref = (f: Partial<CatalogFilters>) => (vendor ? vendorHref(vendor, f) : catalogHref(f));
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cards, setCards] = useState(first);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);

  // A new filter starts the list again. The component stays mounted, so the filters sheet,
  // a facet popover and the sidebar's scroll stay as they were; switching view keeps the list.
  const listKey = catalogQuery({ ...filters, page: 1, view: "grid" });
  const [shownKey, setShownKey] = useState(listKey);
  const [shownFirst, setShownFirst] = useState(first);
  if (listKey !== shownKey || first !== shownFirst) {
    setShownKey(listKey);
    setShownFirst(first);
    if (listKey !== shownKey) {
      setCards(first);
      setFailed(false);
    }
  }

  /** A filter change is a history entry, so Back undoes it; the results scroll into view if they were left behind. */
  const go = (next: CatalogFilters) =>
    startTransition(() => {
      router.push(listHref({ ...next, page: 1 }), { scroll: false });
      const el = top.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
    });

  /** Typing in the panel's search replaces the entry (no history entry per pause). */
  const search = (q: string) => startTransition(() => router.replace(listHref({ ...filters, q, page: 1 }), { scroll: false }));
  const { categoryGroups } = useSiteFacts();
  const scope = categories.find((c) => c.slug === filters.category)?.name ?? categoryGroups.find((g) => g.id === filters.group)?.name ?? null;
  // In a store without a category, the store's own search box above is the one.
  const panelSearch = !vendor || !!(filters.category || filters.group);

  // A filter that picks one value presets that choice on every card.
  const preset = Object.fromEntries(
    Object.entries(filters.specs).flatMap(([k, values]) => (values.length === 1 ? [[k, values[0]]] : [])),
  );

  // A button loads the next page (no endless scroll, so the footer stays reachable).
  /** Pages loaded so far. */
  const pages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));

  // The product page's breadcrumb leads back to this list, filters and all.
  const here = listHref({ ...filters, page: pages });
  useEffect(() => rememberCatalogList(here), [here]);

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    const nextPage = pages + 1;
    try {
      const res = await fetch(`/api/catalog?${catalogQuery({ ...filters, page: nextPage })}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as CatalogPage;
      setCards((prev) => [...prev, ...body.cards.filter((c) => !prev.some((p) => p.id === c.id))]);
      // Keeps the place in the URL without a navigation, so "back" returns here.
      window.history.replaceState(window.history.state, "", listHref({ ...filters, page: nextPage }));
    } catch {
      // No automatic retry: "נסו שוב" asks for it.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  /** Filters on in the panel (program, stock, price, spec values and ranges), for "סינון (N)". */
  const filterCount = panelFilterCount(filters);

  const active: { label: React.ReactNode; clear: CatalogFilters }[] = [
    ...(filters.q ? [{ label: <>חיפוש: <Ltr>{filters.q}</Ltr></>, clear: { ...filters, q: "" } }] : []),
    ...Object.entries(filters.specs).flatMap(([key, values]) =>
      values.map((value) => ({
        label: (
          <>
            {optionLabel(key)}: <Ltr>{value}</Ltr>
          </>
        ),
        clear: toggleSpec(filters, key, value),
      })),
    ),
    ...Object.entries(filters.ranges).map(([key, range]) => ({
      label: (
        <>
          {optionLabel(key)}: <Ltr>{rangeLabel(key, range)}</Ltr>
        </>
      ),
      clear: setRange(filters, key, null),
    })),
    ...(filters.price
      ? [
          {
            label: (
              <>
                מחיר:{" "}
                {filters.price.min !== null && filters.price.max !== null
                  ? `${formatIls(filters.price.min)}–${formatIls(filters.price.max)}`
                  : filters.price.min !== null
                    ? `מ-${formatIls(filters.price.min)}`
                    : `עד ${formatIls(filters.price.max!)}`}
              </>
            ),
            clear: { ...filters, price: null },
          },
        ]
      : []),
    ...(filters.supplier && !vendor
      ? [{ label: <Ltr>{suppliers.find((s) => s.code === filters.supplier)?.name ?? filters.supplier}</Ltr>, clear: { ...filters, supplier: "" } }]
      : []),
    ...(filters.program ? [{ label: <Ltr>{filters.program}</Ltr>, clear: { ...filters, program: "" as const } }] : []),
    ...(filters.availableOnly ? [{ label: "זמינים אצל הספק", clear: { ...filters, availableOnly: false } }] : []),
  ];

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start lg:gap-x-6 lg:gap-y-4">
      {/* The vendor is the main filter: big tiles first, then the category bar; the side panel and the grid under them. */}
      {((!vendor && suppliers.length > 0) || underVendors) && (
        <div className="flex flex-col gap-3 lg:col-span-2">
          {!vendor && suppliers.length > 0 && <VendorFilter vendors={suppliers} value={filters.supplier} onChange={(supplier) => go({ ...filters, supplier })} />}
          {underVendors}
        </div>
      )}

      {/* A plain column that scrolls with the page (CF2): folded sections keep it short, nothing scrolls inside it. */}
      <aside aria-label="סינון" className="filter-panel hidden flex-col gap-3 rounded-2xl p-3 lg:flex">
        {panelSearch && <PanelSearch q={filters.q} scope={scope} onSearch={search} />}
        {filterCount > 0 && (
          <button type="button" onClick={() => go(clearPanel(filters))} className="flex min-h-11 items-center self-start px-1 text-caption font-medium text-brand hover:underline">
            נקה הכל ({filterCount.toLocaleString("he-IL")})
          </button>
        )}
        <FilterFields filters={filters} facets={facets} counts={counts} go={go} />
      </aside>

      <div ref={top} className={`flex min-w-0 scroll-mt-[72px] flex-col gap-3 transition-opacity duration-200 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
        {/* One line above the grid: how many, the sort and the view. On a phone the count has its own line and the "סינון" button leads. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => sheet.current?.showModal()}
            className="tool-chip order-1 me-auto flex min-h-11 shrink-0 items-center gap-1.5 rounded-full ps-3 pe-4 text-caption font-medium sm:order-none sm:me-0 lg:hidden"
          >
            <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden />
            סינון
            {filterCount > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-caption text-white tabular-nums">
                {filterCount}
                <span className="sr-only"> פעילים</span>
              </span>
            )}
          </button>
          <p className="w-full min-w-0 truncate px-1 text-callout font-medium tabular-nums sm:me-auto sm:w-auto" aria-live="polite">
            {total.toLocaleString("he-IL")} <span className="font-normal text-muted">מוצרים</span>
          </p>
          <div className="order-2 flex items-center gap-2 sm:order-none">
          <SortSelect value={filters.sort} onChange={(sort) => go({ ...filters, sort })} />
          <div className="tool-chip flex shrink-0 rounded-full p-0.5" role="group" aria-label="תצוגה">
            {(
              [
                ["grid", LayoutGrid, "כרטיסים"],
                ["list", List, "רשימה"],
              ] as const
            ).map(([view, Icon, label]) => (
              <button
                key={view}
                type="button"
                aria-pressed={filters.view === view}
                aria-label={label}
                title={label}
                onClick={() => startTransition(() => router.replace(listHref({ ...filters, view, page: pages }), { scroll: false }))}
                className={`flex h-11 w-11 items-center justify-center gap-1.5 rounded-full text-caption sm:w-auto sm:px-3 ${
                  filters.view === view ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          </div>
        </div>

        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {active.map((a, i) => (
              <button key={i} type="button" onClick={() => go(a.clear)} className="flex min-h-11 items-center gap-1 rounded-full bg-subtle ps-3 pe-2 text-caption">
                {a.label}
                <X size={14} aria-label="הסרה" />
              </button>
            ))}
            {(hasFilters(filters) || filters.q) && (
              <button
                type="button"
                onClick={() => go({ ...clearPanel(filters), q: "", supplier: "" })}
                className="min-h-11 px-2 text-caption text-brand hover:underline"
              >
                נקה הכל
              </button>
            )}
          </div>
        )}

        {cards.length === 0 ? (
          <div className="card-surface flex flex-col items-center gap-4 p-8 text-center">
            <p className="text-section font-semibold">
              {hasFilters(filters) ? "אין מוצרים שמתאימים לכל הסינונים יחד" : "לא מצאנו מוצרים"}
            </p>
            <p className="text-muted">{hasFilters(filters) ? "אפשר להסיר סינון או לנקות את כולם." : "נסו מילה אחרת, באנגלית או בעברית, או מק״ט של הספק."}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {hasFilters(filters) && (
                <button
                  type="button"
                  onClick={() => go({ ...clearPanel(filters), supplier: "" })}
                  className="flex h-11 items-center rounded-full btn-brand px-5 font-semibold"
                >
                  ניקוי הסינונים
                </button>
              )}
              {filters.q && filters.category && (
                <button type="button" onClick={() => go({ ...filters, category: "" })} className={chip(false)}>
                  חיפוש בכל הקטגוריות
                </button>
              )}
            </div>
            {/* A search that found nothing gets ZeroResults' own categories below. */}
            {!hasFilters(filters) && !filters.q && categories.length > 0 && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-caption text-muted">או לעבור לקטגוריה</span>
                <div className="flex flex-wrap justify-center gap-2">
                  {categories.slice(0, 8).map((c) => (
                    <Link key={c.slug} href={listHref({ category: c.slug })} className={chip(false)}>
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {!hasFilters(filters) && filters.q && (
              <div className="w-full max-w-xl">
                <ZeroResults q={filters.q} />
              </div>
            )}
          </div>
        ) : filters.view === "list" ? (
          <ul className="card-surface px-4">
            {cards.map((c, i) => (
              <FamilyCard key={c.id} family={c} preset={{ ...preset, ...c.skuPreset }} layout="row" eager={i < EAGER_CARDS} />
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:gap-3 xl:grid-cols-4">
            {cards.map((c, i) => (
              <FamilyCard key={c.id} family={c} preset={{ ...preset, ...c.skuPreset }} eager={i < EAGER_CARDS} />
            ))}
          </ul>
        )}

        {cards.length > 0 && (
          <div className="flex flex-col items-center gap-3 py-6 text-caption text-muted">
            <span className="tabular-nums" aria-live="polite">
              {cards.length.toLocaleString("he-IL")} מתוך {total.toLocaleString("he-IL")}
            </span>
            {cards.length < total &&
              (failed ? (
                <button type="button" onClick={() => void loadMore()} className={moreButton}>
                  הטעינה נכשלה. נסו שוב
                </button>
              ) : (
                <button type="button" onClick={() => void loadMore()} disabled={loading} aria-busy={loading} className={moreButton}>
                  {loading ? "טוען…" : "טעינת עוד מוצרים"}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* The phone's filters: a full-height sheet with the same sections, and the result count to go back to. */}
      <dialog ref={sheet} aria-label="סינון" className="sheet sheet-bottom sheet-full" onClick={(e) => e.target === sheet.current && sheet.current?.close()}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-2">
            <h2 className="text-section font-semibold">סינון</h2>
            <button
              type="button"
              onClick={() => sheet.current?.close()}
              aria-label="סגירה"
              className="-me-3 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground"
            >
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4">
            {panelSearch && <PanelSearch q={filters.q} scope={scope} onSearch={search} />}
            <FilterFields filters={filters} facets={facets} counts={counts} go={go} large />
          </div>
          <div className="flex items-center gap-3 border-t border-line px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => go(clearPanel(filters))}
              disabled={filterCount === 0}
              className="flex h-11 shrink-0 items-center rounded-full px-4 text-callout font-medium text-brand disabled:text-muted disabled:opacity-60"
            >
              נקה הכל
            </button>
            <button
              type="button"
              onClick={() => sheet.current?.close()}
              aria-busy={pending}
              className="flex h-11 flex-1 items-center justify-center rounded-full btn-brand font-semibold tabular-nums"
            >
              הצגת {total.toLocaleString("he-IL")} מוצרים
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
