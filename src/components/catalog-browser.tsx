"use client";

import { ChevronDown, LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
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
import { placeUnder } from "./anchored-popover";
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

/** "רק מה שזמין אצל הספק" as a pill with a switch in it; the whole pill is the tap target. */
function AvailableSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      data-on={on || undefined}
      className="tool-chip flex min-h-11 shrink-0 items-center gap-2.5 rounded-full ps-4 pe-2 text-caption font-medium"
    >
      רק מה שזמין אצל הספק
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

/** הכל / FRC / FTC as one segmented pill. */
function ProgramControl({ value, onChange }: { value: CatalogFilters["program"]; onChange: (p: CatalogFilters["program"]) => void }) {
  return (
    <div className="tool-chip flex shrink-0 rounded-full p-0.5" role="group" aria-label="תוכנית">
      {PROGRAMS.map((p) => (
        <button
          key={p || "all"}
          type="button"
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={`h-11 min-w-14 rounded-full px-3 text-caption font-medium transition-colors ${
            value === p ? "bg-brand text-white shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {p ? <Ltr>{p}</Ltr> : "הכל"}
        </button>
      ))}
    </div>
  );
}

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
            <span className={`text-caption tabular-nums ${on ? "text-white/75" : "text-muted"}`}>{v.count.toLocaleString("he-IL")}</span>
          </button>
        );
      })}
    </div>
  );
}

const moreButton =
  "flex h-11 items-center rounded-full border border-line bg-surface px-6 text-callout font-medium text-foreground shadow-card hover:border-brand/40 hover:text-brand disabled:opacity-60";

/**
 * A toolbar chip that drops an anchored panel (the flyout's glass, placed by placeUnder): one
 * option's values, or the options that didn't fit. A popover, so Escape and a tap outside close it.
 */
function ToolMenu({ label, on, count, total, children, icon }: { label: string; on: boolean; count: number; total: number; children: React.ReactNode; icon?: React.ReactNode }) {
  const id = useId();
  const chip = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const place = (e: Event) => {
      if ((e as ToggleEvent).newState === "open" && chip.current) placeUnder(chip.current, el, 380);
    };
    const toggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    el.addEventListener("beforetoggle", place);
    el.addEventListener("toggle", toggle);
    return () => {
      el.removeEventListener("beforetoggle", place);
      el.removeEventListener("toggle", toggle);
    };
  }, []);
  return (
    <>
      <button
        ref={chip}
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        data-on={on || undefined}
        className="tool-chip flex min-h-11 shrink-0 items-center gap-1.5 rounded-full ps-4 pe-3 text-caption font-medium"
      >
        {icon}
        {label}
        {count > 0 && <span className="rounded-full bg-brand px-1.5 text-caption text-white tabular-nums">{count}</span>}
        <ChevronDown size={16} aria-hidden className={`text-muted transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      <div ref={panel} id={id} popover="auto" role="group" aria-label={label} className="flyout">
        <div className="flyout-panel flex flex-col gap-4 p-4">
          {children}
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="flex h-11 w-full shrink-0 items-center justify-center rounded-full btn-brand font-semibold">
            הצגת {total.toLocaleString("he-IL")} מוצרים
          </button>
        </div>
      </div>
    </>
  );
}

/** Option menus shown as their own chips; past one more than this, the rest share "סינונים נוספים". */
const SHOWN_FACETS = 3;

/**
 * The catalog's filters and results. Every change applies at once (no "apply"
 * button) and lives in the URL, so a filtered view can be shared or opened in a
 * new tab. More results load with a button, and the URL keeps how many pages are
 * loaded, so "back" comes back to the same place.
 *
 * No sidebar: the filters are one toolbar over the full-width grid, the options as dropdown chips.
 */
export function CatalogBrowser({ filters, total, cards: first, facets, suppliers, categories, vendor, underVendors }: Props) {
  const listHref = (f: Partial<CatalogFilters>) => (vendor ? vendorHref(vendor, f) : catalogHref(f));
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cards, setCards] = useState(first);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const top = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-col gap-4">
      {/* The vendor is the main filter: big tiles first, then the category bar, then one toolbar over a full-width grid. */}
      {((!vendor && suppliers.length > 0) || underVendors) && (
        <div className="flex flex-col gap-3">
          {!vendor && suppliers.length > 0 && <VendorFilter vendors={suppliers} value={filters.supplier} onChange={(supplier) => go({ ...filters, supplier })} />}
          {underVendors}
        </div>
      )}

      <div ref={top} className={`flex min-w-0 scroll-mt-[72px] flex-col gap-3 transition-opacity duration-200 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
        {/* One toolbar: the program, stock and option filters at the start; the count, sort and view at the end. Wraps on a phone. */}
        <div role="toolbar" aria-label="סינון ותצוגה" className="toolbar flex flex-wrap items-center gap-2 rounded-2xl p-2">
          <ProgramControl value={filters.program} onChange={(program) => go({ ...filters, program })} />
          <AvailableSwitch on={filters.availableOnly} onChange={(on) => go({ ...filters, availableOnly: on })} />
          {(facets.length > SHOWN_FACETS + 1 ? facets.slice(0, SHOWN_FACETS) : facets).map((facet) => {
            const chosen = filters.specs[facet.key] ?? [];
            return (
              <ToolMenu key={facet.key} label={optionLabel(facet.key)} on={chosen.length > 0} count={chosen.length} total={total}>
                <FacetValues facet={facet} chosen={chosen} onToggle={(value) => go(toggleSpec(filters, facet.key, value))} large />
              </ToolMenu>
            );
          })}
          {facets.length > SHOWN_FACETS + 1 && (
            <ToolMenu
              label="סינונים נוספים"
              icon={<SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden />}
              on={facets.slice(SHOWN_FACETS).some((f) => (filters.specs[f.key]?.length ?? 0) > 0)}
              count={facets.slice(SHOWN_FACETS).reduce((n, f) => n + (filters.specs[f.key]?.length ?? 0), 0)}
              total={total}
            >
              {facets.slice(SHOWN_FACETS).map((facet) => (
                <section key={facet.key} className="flex flex-col gap-2">
                  <h3 className="text-callout font-semibold">{optionLabel(facet.key)}</h3>
                  <FacetValues facet={facet} chosen={filters.specs[facet.key] ?? []} onToggle={(value) => go(toggleSpec(filters, facet.key, value))} large />
                </section>
              ))}
            </ToolMenu>
          )}
          <div className="ms-auto flex items-center gap-2">
            <p className="min-w-0 truncate px-1 text-callout font-medium tabular-nums" aria-live="polite">
              {total.toLocaleString("he-IL")} <span className="font-normal text-muted">מוצרים</span>
            </p>
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
                  className={`flex size-11 items-center justify-center rounded-full ${
                    filters.view === view ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden />
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
                onClick={() => go({ ...filters, q: "", supplier: "", program: "", availableOnly: false, specs: {} })}
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
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5">
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

    </div>
  );
}
