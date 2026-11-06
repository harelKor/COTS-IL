"use client";

import { LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
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

type Supplier = { code: string; name: string };

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

const chip = (on: boolean) =>
  `flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] transition-colors ${
    on ? "bg-foreground text-background" : "bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle"
  }`;

/**
 * The catalog's filters and results. Every change applies at once (no "apply"
 * button) and lives in the URL, so a filtered view can be shared or opened in a
 * new tab. Results load as you scroll, and the URL keeps how many pages are
 * loaded, so "back" comes back to the same place.
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
    <div className={`flex flex-col gap-5 transition-opacity duration-200 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 md:-mx-12 md:px-12">
        {facets.map((facet) => {
          const chosen = filters.specs[facet.key] ?? [];
          const id = `facet-${facet.key}`;
          return (
            <div key={facet.key} className="shrink-0">
              <button type="button" popoverTarget={id} className={chip(chosen.length > 0)}>
                {optionLabel(facet.key)}
                {chosen.length > 0 && (
                  <span className="rounded-full bg-background/20 px-1.5 text-caption tabular-nums">{chosen.length}</span>
                )}
              </button>
              <div
                id={id}
                popover="auto"
                className="fixed inset-x-4 top-[120px] m-0 mx-auto max-h-[60dvh] w-auto max-w-md overflow-y-auto rounded-card border border-line bg-surface p-4 text-foreground shadow-lift"
              >
                <p className="mb-3 text-section font-semibold">{optionLabel(facet.key)}</p>
                <div className="flex flex-wrap gap-2">
                  {facet.values.map((v) => (
                    <button key={v.value} type="button" aria-pressed={chosen.includes(v.value)} onClick={() => go(toggleSpec(filters, facet.key, v.value))} className={chip(chosen.includes(v.value))}>
                      <Ltr>{v.value}</Ltr>
                      <span className="text-caption opacity-60 tabular-nums">{v.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => more.current?.showModal()} className={chip(!!(filters.supplier || filters.program || filters.availableOnly || filters.sort !== "relevance"))}>
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
            <button type="button" onClick={() => go({ ...filters, q: "", supplier: "", program: "", availableOnly: false, specs: {} })} className="min-h-9 px-2 text-caption text-brand hover:underline">
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
        <ul className="rounded-card bg-surface px-4">
          {cards.map((c) => (
            <FamilyCard key={c.id} family={c} preset={preset} layout="row" />
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
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

      <dialog ref={more} aria-label="סינונים נוספים" className="sheet sheet-side" onClick={(e) => e.target === more.current && more.current?.close()}>
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center justify-between border-b border-line px-6 py-3">
            <h2 className="text-section font-semibold">סינונים נוספים</h2>
            <button type="button" onClick={() => more.current?.close()} aria-label="סגירה" className="-me-3 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground">
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">ספק</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => go({ ...filters, supplier: "" })} className={chip(!filters.supplier)}>
                  כל הספקים
                </button>
                {suppliers.map((s) => (
                  <button key={s.code} type="button" onClick={() => go({ ...filters, supplier: s.code })} className={chip(filters.supplier === s.code)}>
                    <Ltr>{s.name}</Ltr>
                  </button>
                ))}
              </div>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">תוכנית</h3>
              <div className="flex flex-wrap gap-2">
                {(["", "FRC", "FTC"] as const).map((p) => (
                  <button key={p || "all"} type="button" onClick={() => go({ ...filters, program: p })} className={chip(filters.program === p)}>
                    {p ? <Ltr>{p}</Ltr> : "הכל"}
                  </button>
                ))}
              </div>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">זמינות</h3>
              <button type="button" aria-pressed={filters.availableOnly} onClick={() => go({ ...filters, availableOnly: !filters.availableOnly })} className={`${chip(filters.availableOnly)} self-start`}>
                רק מוצרים זמינים אצל הספק
              </button>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-semibold">מיון</h3>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                  <button key={s} type="button" onClick={() => go({ ...filters, sort: s })} className={chip(filters.sort === s)}>
                    {SORT_LABELS[s]}
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div className="border-t border-line px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={() => more.current?.close()} className="flex h-11 w-full items-center justify-center rounded-full bg-brand font-medium text-white">
              הצגת {total.toLocaleString("he-IL")} מוצרים
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
