"use client";

import { Check, ChevronDown, LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
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
import { FamilyCard } from "./family-card";
import { Ltr } from "./ltr";

type Supplier = { code: string; name: string; count: number };

type Props = {
  filters: CatalogFilters;
  total: number;
  cards: CardFamily[];
  facets: SpecFacet[];
  suppliers: Supplier[];
};

const SORT_LABELS: Record<Sort, string> = {
  relevance: "רלוונטיות",
  "price-asc": "מחיר: מהנמוך",
  "price-desc": "מחיר: מהגבוה",
  title: "שם",
};

const PROGRAMS = ["", "FRC", "FTC"] as const;

const chip = (on: boolean) =>
  `flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] transition-colors ${
    on ? "bg-foreground text-background" : "bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle"
  }`;

/** An on/off switch; the whole row is the tap target. */
function Toggle({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-start text-[15px]"
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
          className={`h-10 rounded-full text-caption font-medium transition-colors ${
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
      className="h-11 w-full rounded-xl bg-subtle px-3 text-[15px] outline-none focus:ring-2 focus:ring-brand"
    >
      {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
        <option key={s} value={s}>
          {SORT_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

/** Suppliers as a list with their product counts; the chosen one is ticked, and a second tap clears it. */
function SupplierList({ suppliers, value, onChange }: { suppliers: Supplier[]; value: string; onChange: (code: string) => void }) {
  const row = (on: boolean) =>
    `flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-3 text-start text-[15px] transition-colors ${
      on ? "bg-subtle font-medium" : "hover:bg-subtle"
    }`;
  return (
    <ul className="flex flex-col">
      <li>
        <button type="button" aria-pressed={!value} onClick={() => onChange("")} className={row(!value)}>
          כל הספקים
          {!value && <Check size={16} className="shrink-0 text-brand" aria-hidden />}
        </button>
      </li>
      {suppliers.map((s) => (
        <li key={s.code}>
          <button
            type="button"
            aria-pressed={value === s.code}
            onClick={() => onChange(value === s.code ? "" : s.code)}
            className={row(value === s.code)}
          >
            <Ltr className="truncate">{s.name}</Ltr>
            {value === s.code ? (
              <Check size={16} className="shrink-0 text-brand" aria-hidden />
            ) : (
              <span className="shrink-0 text-caption text-muted tabular-nums">{s.count.toLocaleString("he-IL")}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A spec's values as small chips with their counts. */
function FacetValues({ facet, chosen, onToggle }: { facet: SpecFacet; chosen: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="no-scrollbar flex max-h-52 flex-wrap gap-1.5 overflow-y-auto pt-1">
      {facet.values.map((v) => {
        const on = chosen.includes(v.value);
        return (
          <button
            key={v.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(v.value)}
            className={`flex min-h-9 items-center gap-1 rounded-full px-3 text-caption transition-colors ${
              on ? "bg-foreground text-background" : "bg-subtle text-foreground hover:bg-line/60"
            }`}
          >
            <Ltr>{v.value}</Ltr>
            <span className="opacity-60 tabular-nums">{v.count}</span>
          </button>
        );
      })}
    </div>
  );
}

const sidebarHeading = "mb-2 text-caption font-semibold text-muted";

/**
 * The catalog's filters and results. Every change applies at once (no "apply"
 * button) and lives in the URL, so a filtered view can be shared or opened in a
 * new tab. Results load as you scroll, and the URL keeps how many pages are
 * loaded, so "back" comes back to the same place.
 *
 * From 1024px the filters sit in a sticky sidebar; below it, in a chip bar and a sheet.
 */
export function CatalogBrowser({ filters, total, cards: first, facets, suppliers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cards, setCards] = useState(first);
  const [loading, setLoading] = useState(false);
  const pages = useRef(Math.max(1, Math.ceil(first.length / PAGE_SIZE)));
  const sentinel = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDialogElement>(null);

  const go = (next: CatalogFilters) => startTransition(() => router.replace(catalogHref({ ...next, page: 1 }), { scroll: false }));

  // A filter that picks one value presets that choice on every card.
  const preset = Object.fromEntries(
    Object.entries(filters.specs).flatMap(([k, values]) => (values.length === 1 ? [[k, values[0]]] : [])),
  );

  useEffect(() => {
    const el = sentinel.current;
    if (!el || cards.length >= total) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loading) return;
        setLoading(true);
        const nextPage = pages.current + 1;
        try {
          const res = await fetch(`/api/catalog?${catalogQuery({ ...filters, page: nextPage })}`);
          const body = (await res.json()) as CatalogPage;
          pages.current = nextPage;
          setCards((prev) => [...prev, ...body.cards.filter((c) => !prev.some((p) => p.id === c.id))]);
          // Keeps the place in the URL without a navigation, so "back" returns here.
          window.history.replaceState(window.history.state, "", catalogHref({ ...filters, page: nextPage }));
        } finally {
          setLoading(false);
        }
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cards.length, total, filters, loading]);

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
    ...(filters.supplier
      ? [{ label: <Ltr>{suppliers.find((s) => s.code === filters.supplier)?.name ?? filters.supplier}</Ltr>, clear: { ...filters, supplier: "" } }]
      : []),
    ...(filters.program ? [{ label: <Ltr>{filters.program}</Ltr>, clear: { ...filters, program: "" as const } }] : []),
    ...(filters.availableOnly ? [{ label: "זמינים בלבד", clear: { ...filters, availableOnly: false } }] : []),
  ];

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[250px_1fr] lg:items-start lg:gap-8">
      <aside
        aria-label="סינון"
        className="card-surface no-scrollbar hidden max-h-[calc(100dvh-96px)] flex-col gap-5 overflow-y-auto p-4 lg:sticky lg:top-[72px] lg:flex"
      >
        <Toggle on={filters.availableOnly} onChange={(on) => go({ ...filters, availableOnly: on })}>
          זמינים במלאי בלבד
        </Toggle>
        <section>
          <h2 className={sidebarHeading}>תוכנית</h2>
          <ProgramControl value={filters.program} onChange={(program) => go({ ...filters, program })} />
        </section>
        <section>
          <h2 className={sidebarHeading}>מיון</h2>
          <SortSelect value={filters.sort} onChange={(sort) => go({ ...filters, sort })} />
        </section>
        <section>
          <h2 className={sidebarHeading}>ספק</h2>
          <SupplierList suppliers={suppliers} value={filters.supplier} onChange={(supplier) => go({ ...filters, supplier })} />
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

      <div className={`flex min-w-0 flex-col gap-5 transition-opacity duration-200 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
        <div className="no-scrollbar scroll-fade-x -mx-6 flex gap-2 overflow-x-auto px-6 pb-1 md:-mx-12 md:px-12 lg:hidden">
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
                  <div className="flex flex-wrap gap-2">
                    {facet.values.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        aria-pressed={chosen.includes(v.value)}
                        onClick={() => go(toggleSpec(filters, facet.key, v.value))}
                        className={chip(chosen.includes(v.value))}
                      >
                        <Ltr>{v.value}</Ltr>
                        <span className="text-caption opacity-60 tabular-nums">{v.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => more.current?.showModal()}
            className={chip(!!(filters.supplier || filters.program || filters.availableOnly || filters.sort !== "relevance"))}
          >
            <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden />
            סינונים נוספים
          </button>
        </div>

        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {active.map((a, i) => (
              <button key={i} type="button" onClick={() => go(a.clear)} className="flex min-h-9 items-center gap-1 rounded-full bg-subtle ps-3 pe-2 text-caption">
                {a.label}
                <X size={14} aria-label="הסרה" />
              </button>
            ))}
            {(hasFilters(filters) || filters.q) && (
              <button
                type="button"
                onClick={() => go({ ...filters, q: "", supplier: "", program: "", availableOnly: false, specs: {} })}
                className="min-h-9 px-2 text-caption text-brand hover:underline"
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
                onClick={() => startTransition(() => router.replace(catalogHref({ ...filters, view, page: pages.current }), { scroll: false }))}
                className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-caption ${filters.view === view ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        {cards.length === 0 ? (
          <p className="rounded-card border border-dashed border-line bg-surface p-8 text-center text-muted">
            לא מצאנו מוצרים. נסו מילה אחרת או הסירו חלק מהסינונים.
          </p>
        ) : filters.view === "list" ? (
          <ul className="card-surface px-4">
            {cards.map((c) => (
              <FamilyCard key={c.id} family={c} preset={preset} layout="row" />
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {cards.map((c) => (
              <FamilyCard key={c.id} family={c} preset={preset} />
            ))}
          </ul>
        )}

        <div ref={sentinel} className="flex flex-col items-center gap-2 py-6 text-caption text-muted">
          {cards.length < total && (
            <>
              <span>
                מוצגים {cards.length.toLocaleString("he-IL")} מתוך {total.toLocaleString("he-IL")}
              </span>
              {loading && <span className="skeleton h-2 w-24" aria-hidden />}
            </>
          )}
        </div>
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
              זמינים במלאי בלבד
            </Toggle>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">תוכנית</h3>
              <ProgramControl value={filters.program} onChange={(program) => go({ ...filters, program })} />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">מיון</h3>
              <SortSelect value={filters.sort} onChange={(sort) => go({ ...filters, sort })} />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">ספק</h3>
              <SupplierList suppliers={suppliers} value={filters.supplier} onChange={(supplier) => go({ ...filters, supplier })} />
            </section>
          </div>
          <div className="border-t border-line px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => more.current?.close()}
              className="flex h-11 w-full items-center justify-center rounded-full bg-brand font-medium text-white"
            >
              הצגת {total.toLocaleString("he-IL")} מוצרים
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
