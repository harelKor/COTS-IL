"use client";

import { ChevronDown, LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CatalogPage } from "@/app/api/catalog/route";
import { optionLabel } from "@/domain/families/sort";
import type { CardFamily, SpecFacet } from "@/lib/catalog";
import {
  catalogHref,
  catalogQuery,
  hasFilters,
  PAGE_SIZE,
  toggleSpec,
  type CatalogFilters,
  type Sort,
} from "@/lib/catalog-filters";
import { EAGER_CARDS } from "@/lib/images";
import { vendorHref } from "@/domain/vendors";
import { FamilyCard } from "./family-card";
import { Ltr } from "./ltr";
import { rememberCatalogList } from "./back-to-list";
import { ScrollRow } from "./scroll-row";
import { ZeroResults } from "./zero-results";
import { VendorFilter, type VendorOption } from "./vendor-filter";

type Supplier = VendorOption;

type Props = {
  filters: CatalogFilters;
  total: number;
  cards: CardFamily[];
  facets: SpecFacet[];
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

const PROGRAMS = ["", "FRC", "FTC"] as const;

const chip = (on: boolean) =>
  `flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-callout transition-colors ${
    on ? "bg-brand text-white" : "bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle"
  }`;

/** An on/off switch; the whole row is the tap target. */
function Toggle({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-start text-callout"
    >
      {children}
      <span className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-success" : "bg-line"}`} aria-hidden>
        <span
          className={`absolute top-[3px] size-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] duration-200 ease-spring ${
            on ? "start-[21px]" : "start-[3px]"
          }`}
        />
      </span>
    </button>
  );
}

/** הכל / FRC / FTC as one segmented control. */
function ProgramControl({ value, onChange }: { value: CatalogFilters["program"]; onChange: (p: CatalogFilters["program"]) => void }) {
  return (
    <div className="grid grid-cols-3 rounded-full bg-subtle p-0.5" role="group" aria-label="תוכנית">
      {PROGRAMS.map((p) => (
        <button
          key={p || "all"}
          type="button"
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={`h-11 rounded-full text-caption font-medium transition-colors ${
            value === p ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {p ? <Ltr>{p}</Ltr> : "הכל"}
        </button>
      ))}
    </div>
  );
}

function SortSelect({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Sort)}
      aria-label="מיון"
      className="h-11 w-full rounded-xl bg-subtle px-3 text-callout outline-none focus:ring-2 focus:ring-brand"
    >
      {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
        <option key={s} value={s}>
          {SORT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

/**
 * A spec's values as chips with how many products a tap would show. A value that would
 * show nothing is dimmed and can't be tapped, unless it's already chosen (so it can be cleared).
 */
function FacetValues({ facet, chosen, onToggle, large = false }: { facet: SpecFacet; chosen: string[]; onToggle: (value: string) => void; large?: boolean }) {
  return (
    <div className={large ? "flex flex-wrap gap-2" : "no-scrollbar flex max-h-52 flex-wrap gap-1.5 overflow-y-auto pt-1"}>
      {facet.values.map((v) => {
        const on = chosen.includes(v.value);
        const empty = v.count === 0 && !on;
        return (
          <button
            key={v.value}
            type="button"
            aria-pressed={on}
            disabled={empty}
            onClick={() => onToggle(v.value)}
            className={`flex items-center gap-1.5 rounded-full px-3 transition-colors ${large ? "min-h-11 text-callout" : "min-h-11 text-caption"} ${
              on
                ? "bg-brand text-white"
                : empty
                  ? "bg-subtle text-muted opacity-50"
                  : large
                    ? "bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle"
                    : "bg-subtle text-foreground hover:bg-line/60"
            }`}
          >
            <Ltr>{v.value}</Ltr>
            <span className={`text-caption tabular-nums ${on ? "text-background/70" : "text-muted"}`}>{v.count.toLocaleString("he-IL")}</span>
          </button>
        );
      })}
    </div>
  );
}

const moreButton =
  "flex h-11 items-center rounded-full border border-line bg-surface px-6 text-callout font-medium text-foreground shadow-card hover:border-brand/40 hover:text-brand disabled:opacity-60";

const sidebarHeading = "mb-2 text-caption font-semibold text-muted";

/**
 * The catalog's filters and results. Every change applies at once (no "apply"
 * button) and lives in the URL, so a filtered view can be shared or opened in a
 * new tab. More results load with a button, and the URL keeps how many pages are
 * loaded, so "back" comes back to the same place.
 *
 * From 1024px the filters sit in a sticky sidebar; below it, in a chip bar and a sheet.
 */
export function CatalogBrowser({ filters, total, cards: first, facets, suppliers, categories, vendor, underVendors }: Props) {
  const listHref = (f: Partial<CatalogFilters>) => (vendor ? vendorHref(vendor, f) : catalogHref(f));
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cards, setCards] = useState(first);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDialogElement>(null);

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
    ...(filters.supplier && !vendor
      ? [{ label: <Ltr>{suppliers.find((s) => s.code === filters.supplier)?.name ?? filters.supplier}</Ltr>, clear: { ...filters, supplier: "" } }]
      : []),
    ...(filters.program ? [{ label: <Ltr>{filters.program}</Ltr>, clear: { ...filters, program: "" as const } }] : []),
    ...(filters.availableOnly ? [{ label: "זמינים אצל הספק", clear: { ...filters, availableOnly: false } }] : []),
  ];

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[250px_1fr] lg:items-start lg:gap-x-8 lg:gap-y-4">
      {/* The vendor is the main filter: big tiles above the side panel and the results. */}
      {((!vendor && suppliers.length > 0) || underVendors) && (
        <div className="flex flex-col gap-3 lg:col-span-2">
          {!vendor && suppliers.length > 0 && <VendorFilter vendors={suppliers} value={filters.supplier} onChange={(supplier) => go({ ...filters, supplier })} />}
          {underVendors}
        </div>
      )}
      <aside
        aria-label="סינון"
        className="card-surface no-scrollbar hidden max-h-[calc(100dvh-96px)] flex-col gap-5 overflow-y-auto p-4 lg:sticky lg:top-[72px] lg:flex"
      >
        <Toggle on={filters.availableOnly} onChange={(on) => go({ ...filters, availableOnly: on })}>
          רק מה שזמין אצל הספק
        </Toggle>
        <section>
          <h2 className={sidebarHeading}>תוכנית</h2>
          <ProgramControl value={filters.program} onChange={(program) => go({ ...filters, program })} />
        </section>
        <section>
          <h2 className={sidebarHeading}>מיון</h2>
          <SortSelect value={filters.sort} onChange={(sort) => go({ ...filters, sort })} />
        </section>
        {facets.map((facet) => {
          const chosen = filters.specs[facet.key] ?? [];
          return (
            <details key={facet.key} open className="group border-t border-line pt-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                <span>
                  {optionLabel(facet.key)}
                  {chosen.length > 0 && <span className="ms-1.5 text-caption font-normal text-brand tabular-nums">{chosen.length}</span>}
                </span>
                <ChevronDown size={16} aria-hidden className="text-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <FacetValues facet={facet} chosen={chosen} onToggle={(value) => go(toggleSpec(filters, facet.key, value))} />
            </details>
          );
        })}
      </aside>

      <div ref={top} className={`flex min-w-0 scroll-mt-[72px] flex-col gap-5 transition-opacity duration-200 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
        <ScrollRow className="lg:hidden">
          {facets.map((facet) => {
            const chosen = filters.specs[facet.key] ?? [];
            const id = `facet-${facet.key}`;
            return (
              <div key={facet.key} className="shrink-0">
                <button type="button" popoverTarget={id} className={chip(chosen.length > 0)}>
                  {optionLabel(facet.key)}
                  {chosen.length > 0 && <span className="rounded-full bg-background/20 px-1.5 text-caption tabular-nums">{chosen.length}</span>}
                </button>
                <div
                  id={id}
                  popover="auto"
                  className="fixed inset-x-4 top-[120px] m-0 mx-auto max-h-[60dvh] w-auto max-w-md overflow-y-auto rounded-card border border-line bg-surface p-4 text-foreground shadow-lift"
                >
                  <p className="mb-3 text-section font-semibold">{optionLabel(facet.key)}</p>
                  <FacetValues facet={facet} chosen={chosen} onToggle={(value) => go(toggleSpec(filters, facet.key, value))} large />
                  <button
                    type="button"
                    popoverTarget={id}
                    popoverTargetAction="hide"
                    className="mt-4 flex h-11 w-full items-center justify-center rounded-full btn-brand font-semibold"
                  >
                    הצגת {total.toLocaleString("he-IL")} מוצרים
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => more.current?.showModal()}
            className={chip(!!(filters.program || filters.availableOnly || filters.sort !== "relevance"))}
          >
            <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden />
            סינונים נוספים
          </button>
        </ScrollRow>

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
                onClick={() => go({ ...filters, q: "", supplier: "", program: "", availableOnly: false, specs: {} })}
                className="min-h-11 px-2 text-caption text-brand hover:underline"
              >
                נקה הכל
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-caption text-muted" aria-live="polite">
            {total.toLocaleString("he-IL")} מוצרים
          </p>
          <div className="flex rounded-full bg-subtle p-0.5" role="group" aria-label="תצוגה">
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
                onClick={() => startTransition(() => router.replace(listHref({ ...filters, view, page: pages }), { scroll: false }))}
                className={`flex h-11 items-center gap-1.5 rounded-full px-3 text-caption ${filters.view === view ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

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
                  onClick={() => go({ ...filters, supplier: "", program: "", availableOnly: false, specs: {} })}
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
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
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

      <dialog ref={more} aria-label="סינונים נוספים" className="sheet sheet-side" onClick={(e) => e.target === more.current && more.current?.close()}>
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center justify-between border-b border-line px-6 py-3">
            <h2 className="text-section font-semibold">סינונים נוספים</h2>
            <button
              type="button"
              onClick={() => more.current?.close()}
              aria-label="סגירה"
              className="-me-3 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground"
            >
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
            <Toggle on={filters.availableOnly} onChange={(on) => go({ ...filters, availableOnly: on })}>
              רק מה שזמין אצל הספק
            </Toggle>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">תוכנית</h3>
              <ProgramControl value={filters.program} onChange={(program) => go({ ...filters, program })} />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">מיון</h3>
              <SortSelect value={filters.sort} onChange={(sort) => go({ ...filters, sort })} />
            </section>
          </div>
          <div className="border-t border-line px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => more.current?.close()}
              className="flex h-11 w-full items-center justify-center rounded-full btn-brand font-semibold"
            >
              הצגת {total.toLocaleString("he-IL")} מוצרים
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
