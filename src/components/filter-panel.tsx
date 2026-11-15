"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import {
  defaultOpenFacets,
  facetLayout,
  formatRange,
  hasRange,
  isFacetOpen,
  previewValues,
  PREVIEW_ROWS,
  RANGE_KEYS,
  rangeLabel,
  readBound,
  showsCoverage,
  type NumRange,
  type RangeUnit,
} from "@/domain/facets";
import { optionLabel } from "@/domain/families/sort";
import { matchList } from "@/domain/list-search";
import { formatIls } from "@/domain/pricing";
import type { ControlCounts, SpecFacet } from "@/lib/catalog";
import { setRange, toggleSpec, type CatalogFilters } from "@/lib/catalog-filters";
import { Ltr } from "./ltr";
import { SearchField } from "./search-field";

const PROGRAMS = ["", "FRC", "FTC"] as const;

const n = (count: number) => count.toLocaleString("he-IL");

/* ---------- Which facets are open: the user's choice, for this session ---------- */

const MEMORY_KEY = "catalog-facets-open";
/** Where the choice lives when sessionStorage can't be used (a private window, blocked storage). */
let memory = "";
const listeners = new Set<() => void>();

function readMemory(): string {
  try {
    return window.sessionStorage.getItem(MEMORY_KEY) ?? memory;
  } catch {
    return memory;
  }
}

function subscribeMemory(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the user opened or closed this session, by facet key (the panel and the phone sheet share it). */
function useFacetMemory(): [Record<string, boolean>, (key: string, open: boolean) => void] {
  const raw = useSyncExternalStore(subscribeMemory, readMemory, () => "");
  const chosen = useMemo<Record<string, boolean>>(() => {
    try {
      const value: unknown = JSON.parse(raw || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }, [raw]);
  const set = (key: string, open: boolean) => {
    memory = JSON.stringify({ ...chosen, [key]: open });
    try {
      window.sessionStorage.setItem(MEMORY_KEY, memory);
    } catch {
      // Kept in memory instead.
    }
    for (const l of listeners) l();
  };
  return [chosen, set];
}

/* ---------- The controls ---------- */

/** "רק מה שזמין אצל הספק (N)": an on/off switch; the whole row is the tap target. */
function AvailableSwitch({ on, count, onChange }: { on: boolean; count?: number; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex min-h-11 w-full items-center justify-between gap-3 text-start text-callout">
      <span>
        רק מה שזמין אצל הספק
        {count !== undefined && <span className="ms-1 text-caption text-muted tabular-nums">({n(count)})</span>}
      </span>
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

/** הכל / FRC (N) / FTC (N) as one segmented pill, as wide as the panel. */
function ProgramControl({
  value,
  counts,
  onChange,
}: {
  value: CatalogFilters["program"];
  counts: ControlCounts | null;
  onChange: (p: CatalogFilters["program"]) => void;
}) {
  return (
    <div className="tool-chip grid grid-cols-[auto_1fr_1fr] rounded-full p-0.5" role="group" aria-label="תוכנית">
      {PROGRAMS.map((p) => {
        const count = p === "FRC" ? counts?.frc : p === "FTC" ? counts?.ftc : undefined;
        return (
          <button
            key={p || "all"}
            type="button"
            aria-pressed={value === p}
            onClick={() => onChange(p)}
            className={`flex h-11 items-center justify-center gap-1 rounded-full px-3 text-caption font-medium transition-colors ${
              value === p ? "bg-brand text-white shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {p ? <Ltr>{p}</Ltr> : "הכל"}
            {count !== undefined && <span className={`font-normal tabular-nums ${value === p ? "text-white/75" : ""}`}>({n(count)})</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A folding section: its title, the selected count as a small pill, and a chevron. */
function FacetSection({
  title,
  selected,
  open,
  onToggle,
  children,
}: {
  title: React.ReactNode;
  selected: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section className="border-t border-line pt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-start text-callout font-semibold"
      >
        <span className="flex min-w-0 items-center gap-2">
          {title}
          {selected > 0 && (
            <span className="rounded-full bg-brand-soft px-2 text-caption font-medium text-brand tabular-nums">
              {n(selected)}
              <span className="sr-only"> נבחרו</span>
            </span>
          )}
        </span>
        <ChevronDown size={16} aria-hidden className={`shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-2 pt-1 pb-2">
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * A short facet's values as chips: the label, then its count, muted and in brackets ("20 DP (29)").
 * A value that would show nothing is dimmed and can't be tapped, unless it's chosen (so it can be cleared).
 */
function FacetChips({ facet, chosen, onToggle, large }: { facet: SpecFacet; chosen: string[]; onToggle: (value: string) => void; large: boolean }) {
  return (
    <div className={`flex flex-wrap ${large ? "gap-2" : "gap-1.5"}`}>
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
            className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 transition-colors ${large ? "text-callout" : "text-caption"} ${
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
            <span className={`text-caption tabular-nums ${on ? "text-white/75" : "text-muted"}`}>({n(v.count)})</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A long facet as a checkbox list, one value per row with its count at the end: its most common
 * values (and every chosen one) until "הצגת כל N", which adds a search box and the rest. No
 * scroll box: the panel only grows.
 */
function FacetList({
  facet,
  chosen,
  onToggle,
  rows,
}: {
  facet: SpecFacet;
  chosen: string[];
  onToggle: (value: string) => void;
  rows: number;
}) {
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const title = optionLabel(facet.key);
  const shown = all ? matchList(facet.values, query, (v) => v.value) : previewValues(facet.values, chosen, rows);
  return (
    <>
      {all && <SearchField type="search" value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder={`חיפוש ב${title}`} aria-label={`חיפוש ב${title}`} />}
      <ul className="flex flex-col">
        {shown.map((v) => {
          const on = chosen.includes(v.value);
          const empty = v.count === 0 && !on;
          return (
            <li key={v.value}>
              <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-callout hover:bg-subtle ${empty ? "cursor-default opacity-50" : ""}`}>
                <input type="checkbox" checked={on} disabled={empty} onChange={() => onToggle(v.value)} className="size-[18px] shrink-0 accent-brand" />
                <Ltr className="min-w-0 flex-1 truncate text-start">{v.value}</Ltr>
                <span className="shrink-0 text-caption text-muted tabular-nums">({n(v.count)})</span>
              </label>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="px-2 py-2 text-caption text-muted">
            אין התאמה ל-<Ltr>{query}</Ltr>
          </li>
        )}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setAll(!all);
            setQuery("");
          }}
          aria-expanded={all}
          className="flex min-h-11 items-center px-2 text-caption font-medium text-brand hover:underline"
        >
          {all ? "הצגת פחות" : `הצגת כל ${n(facet.values.length)}`}
        </button>
        <Coverage facet={facet} />
      </div>
    </>
  );
}

/** "ידוע ל-45 מתוך 167": under ~90%, how many products in view have the spec at all (P0-2). */
function Coverage({ facet }: { facet: SpecFacet }) {
  if (!showsCoverage(facet.reach, facet.total)) return null;
  return (
    <p className="px-1 text-caption text-muted tabular-nums">
      ידוע ל-{n(facet.reach)} מתוך {n(facet.total)}
    </p>
  );
}

/**
 * From–to fields, applied on Enter or when focus leaves them (no "apply" step). Sizes have a unit
 * toggle (in / mm); an empty pair clears the range.
 */
function RangeFields({
  label,
  value,
  units,
  placeholders = ["מ-", "עד"],
  onApply,
}: {
  label: string;
  value: NumRange | null;
  units?: RangeUnit[] | null;
  placeholders?: [string, string];
  onApply: (range: NumRange | null) => void;
}) {
  const [min, setMin] = useState(value?.min?.toString() ?? "");
  const [max, setMax] = useState(value?.max?.toString() ?? "");
  const [unit, setUnit] = useState<RangeUnit | undefined>(value?.unit ?? units?.[0]);

  const apply = (nextUnit = unit) => {
    const from = readBound(min);
    const to = readBound(max);
    const next: NumRange | null = from === null && to === null ? null : { min: from, max: to, ...(units ? { unit: nextUnit } : {}) };
    const same = next === null ? value === null : value !== null && formatRange(next) === formatRange(value);
    if (!same) onApply(next);
  };

  const field = "h-11 w-full min-w-0 rounded-xl bg-subtle/70 px-3 text-callout tabular-nums outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/60";
  return (
    <form
      role="group"
      aria-label={label}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) apply();
      }}
    >
      <input inputMode="decimal" dir="ltr" value={min} onChange={(e) => setMin(e.target.value)} placeholder={placeholders[0]} aria-label={`${label}: מ-`} className={field} />
      <span aria-hidden className="text-muted">
        –
      </span>
      <input inputMode="decimal" dir="ltr" value={max} onChange={(e) => setMax(e.target.value)} placeholder={placeholders[1]} aria-label={`${label}: עד`} className={field} />
      {units && (
        <div className="tool-chip flex shrink-0 rounded-full p-0.5" role="group" aria-label="יחידה">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => {
                setUnit(u);
                apply(u);
              }}
              className={`flex h-11 min-w-11 items-center justify-center rounded-full px-2 text-caption ${unit === u ? "bg-surface text-foreground shadow-sm" : "text-muted"}`}
            >
              <Ltr>{u === "in" ? '"' : "mm"}</Ltr>
            </button>
          ))}
        </div>
      )}
      <button type="submit" className="sr-only">
        החלה
      </button>
    </form>
  );
}

/* ---------- The panel's search ---------- */

/**
 * "חיפוש בגלגלי שיניים…": narrows the results inside the category (or group) in view, keeping
 * every other filter; with neither, the whole catalog. Typing applies after a short pause.
 */
export function PanelSearch({ q, scope, onSearch }: { q: string; scope: string | null; onSearch: (q: string) => void }) {
  const [text, setText] = useState(q);
  const [seen, setSeen] = useState(q);
  const [sent, setSent] = useState<string | null>(null);
  // A search changed elsewhere (the header, a removed chip) shows here; the one this box sent doesn't undo typing since.
  if (q !== seen) {
    setSeen(q);
    if (q !== sent) setText(q);
  }
  const send = (value: string) => {
    setSent(value);
    onSearch(value);
  };
  useEffect(() => {
    const value = text.trim();
    if (value === q.trim()) return;
    const timer = window.setTimeout(() => send(value), 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, q]);
  const label = scope ? `חיפוש ב${scope}` : "חיפוש בקטלוג";
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() !== q.trim()) send(text.trim());
      }}
    >
      <SearchField
        type="search"
        enterKeyHint="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onClear={() => {
          setText("");
          send("");
        }}
        placeholder={`${label}…`}
        aria-label={label}
        maxLength={100}
      />
    </form>
  );
}

/* ---------- The panel ---------- */

export type FilterFieldsProps = {
  filters: CatalogFilters;
  facets: SpecFacet[];
  counts: ControlCounts | null;
  go: (next: CatalogFilters) => void;
  /** The phone sheet: bigger chips. */
  large?: boolean;
};

/**
 * The filters: the program and stock, then the specs (פסיעה, שיניים, …) and the price, each a
 * section that folds. Open at first: the two specs most products in view have; the user's own
 * opening and closing is kept for the session. The same content in the side panel and the phone sheet.
 */
export function FilterFields({ filters, facets, counts, go, large = false }: FilterFieldsProps) {
  const [chosenOpen, remember] = useFacetMemory();
  const defaults = defaultOpenFacets(facets);
  const section = (key: string) => {
    const open = isFacetOpen(key, defaults, chosenOpen);
    return { open, onToggle: () => remember(key, !open) };
  };
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-caption font-semibold text-muted">תוכנית</h3>
        <ProgramControl value={filters.program} counts={counts} onChange={(program) => go({ ...filters, program, page: 1 })} />
      </section>
      <AvailableSwitch on={filters.availableOnly} count={counts?.available} onChange={(on) => go({ ...filters, availableOnly: on, page: 1 })} />
      {facets.map((facet) => {
        const chosen = filters.specs[facet.key] ?? [];
        const range = filters.ranges[facet.key] ?? null;
        const ranged = hasRange(facet.key);
        const title = optionLabel(facet.key);
        return (
          <FacetSection key={facet.key} title={title} selected={chosen.length + (range ? 1 : 0)} {...section(facet.key)}>
            {ranged && (
              <RangeFields
                key={range ? formatRange(range) : "none"}
                label={title}
                value={range}
                units={RANGE_KEYS[facet.key]}
                onApply={(next) => go(setRange(filters, facet.key, next))}
              />
            )}
            {range && (
              <p className="flex items-center gap-1 px-1 text-caption text-muted">
                <span>
                  מוצגים: <Ltr>{rangeLabel(facet.key, range)}</Ltr>
                </span>
                <button type="button" onClick={() => go(setRange(filters, facet.key, null))} aria-label={`הסרת הטווח של ${title}`} className="flex size-11 items-center justify-center rounded-full hover:text-foreground">
                  <X size={14} aria-hidden />
                </button>
              </p>
            )}
            {facetLayout(facet.values.length) === "chips" ? (
              <>
                <FacetChips facet={facet} chosen={chosen} onToggle={(value) => go(toggleSpec(filters, facet.key, value))} large={large} />
                <Coverage facet={facet} />
              </>
            ) : (
              <FacetList facet={facet} chosen={chosen} onToggle={(value) => go(toggleSpec(filters, facet.key, value))} rows={ranged ? PREVIEW_ROWS - 1 : PREVIEW_ROWS} />
            )}
          </FacetSection>
        );
      })}
      <FacetSection title="מחיר" selected={filters.price ? 1 : 0} {...section("price")}>
        <RangeFields
          key={filters.price ? `${filters.price.min}-${filters.price.max}` : "none"}
          label="מחיר"
          value={filters.price}
          placeholders={[
            counts?.minIls != null ? `מ-${formatIls(counts.minIls)}` : "מ-",
            counts?.maxIls != null ? `עד ${formatIls(counts.maxIls)}` : "עד",
          ]}
          onApply={(price) => go({ ...filters, price: price ? { min: price.min === null ? null : Math.round(price.min), max: price.max === null ? null : Math.round(price.max) } : null, page: 1 })}
        />
        <p className="px-1 text-caption text-muted">המחיר הנמוך של כל מוצר</p>
      </FacetSection>
    </>
  );
}
