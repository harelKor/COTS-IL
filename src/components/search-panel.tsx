"use client";

import { ChevronDown, Clock, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SearchResponse, SearchResult } from "@/app/api/search/route";
import { formatIls } from "@/domain/pricing";
import { catalogHref } from "@/lib/catalog-filters";
import type { CardFamily } from "@/lib/catalog";
import { packSize } from "@/domain/pack-size";
import { shopifyImage } from "@/lib/images";
import { normalizeSearch, parseQuickQuery } from "@/lib/quick-query";
import { useSiteFacts } from "./site-facts";
import { addToCartNow } from "./cart-actions";
import { canEditCart, useCartMode } from "./cart-store";
import { CategoryIcon } from "./category-icon";
import { FamilyCard } from "./family-card";
import { Ltr } from "./ltr";
import { showToast } from "./toast";
import { ZeroResults } from "./zero-results";
import { track } from "@vercel/analytics";

const PLACEHOLDER = "חיפוש מוצר, מק״ט או ספק";

/** The search a results page shows (/catalog?q=…), or "" anywhere else. */
function pageQuery(pathname: string, params: URLSearchParams | null) {
  return pathname === "/catalog" ? (params?.get("q")?.trim() ?? "") : "";
}

/**
 * The header box's words: on a results page the search it shows, so the query stays in the box
 * after Enter (audit C-08); anywhere else the placeholder.
 */
function TriggerText() {
  const q = pageQuery(usePathname(), useSearchParams());
  // Its own direction, so a long Latin search is cut at its end, not its start (C-11); it sits
  // beside the search icon like the placeholder.
  return q ? (
    <span dir="auto" className="min-w-0 truncate text-foreground">
      {q}
    </span>
  ) : (
    <span className="min-w-0 truncate">{PLACEHOLDER}</span>
  );
}

/** Opens the search panel from anywhere on the site. */
export const openSearch = () => window.dispatchEvent(new Event("search:open"));

/** Typing in a field shouldn't open the panel when "/" is pressed. */
function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

const RECENT_KEY = "search:recent";
const MAX_RECENT = 5;

/** The last searches on this device, newest first. Private windows can refuse storage. */
function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list)
      ? list
          .filter((x): x is string => typeof x === "string")
          .slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  const text = q.trim();
  if (text.length < 2) return;
  try {
    const next = [
      text,
      ...readRecent().filter((x) => x.toLowerCase() !== text.toLowerCase()),
    ].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not saved; nothing else depends on it.
  }
}

const noSubscribe = () => () => {};
/** "⌘K" on a Mac, "Ctrl K" elsewhere (and while prerendering). */
const shortcutLabel = () =>
  /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";
const serverShortcut = () => "Ctrl K";

/** A search row as a catalog card, so a part with options can be chosen and added from the panel. */
function asCard(r: SearchResult): CardFamily {
  const slug = decodeURIComponent(r.href.split("?")[0].split("/").pop() ?? "");
  return {
    id: r.id,
    slug,
    title: r.title,
    image: r.image,
    supplierNames: r.supplierName.split(", "),
    supplierCodes: r.supplierCodes,
    minPriceIls: r.priceIls,
    maxPriceIls: r.maxPriceIls,
    available: r.available,
    shipsLater: r.shipsLater,
    checkedAt: r.checkedAt,
    variantCount: r.variantCount,
    optionKeys: r.optionKeys,
    orderable: r.variantCount > 0,
    onlyVariant: null,
    packSize: packSize(r.title),
  };
}

/**
 * Spotlight-style search: "/" or Ctrl/⌘K anywhere opens it, results come while
 * typing, and "+" adds a single part to the cart without leaving the page; a part
 * with options opens its chips on the row. A trailing "x4" sets the quantity.
 * Enter opens "all results" unless a row was picked with the arrows or the mouse.
 */
export function SearchPanel() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // The mode only: the header's panel needn't re-render on every cart change.
  const mode = useCartMode();
  const shortcut = useSyncExternalStore(
    noSubscribe,
    shortcutLabel,
    serverShortcut,
  );
  const { searchExamples, searchCategories } = useSiteFacts();
  const [text, setText] = useState("");
  // Results are kept with the text they answer: while the next ones load, these stay, dimmed.
  const [found, setFound] = useState<{ text: string } & SearchResponse>({
    text: "",
    results: [],
    q: "",
    qty: 1,
    corrected: null,
    suggestions: [],
  });
  // The row the user picked with the arrows or the mouse; null until they do.
  const [active, setActive] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  // The results page's search the panel last started from, so a new one replaces old typing.
  const startedFrom = useRef<string | null>(null);
  const listId = useId();

  const { q, text: query } = parseQuickQuery(text);
  const ready = found.text === query;
  const results = q.length >= 2 ? found.results : [];
  // The server knows "Kraken X60" is a name, not 60 of something: until it answers, no quantity.
  const qty = ready ? found.qty : 1;
  const searchText = ready && found.q ? found.q : q;
  const searching = q.length >= 2 && !ready;
  const canAdd = canEditCart(mode);

  function open() {
    if (dialog.current?.open) return;
    setRecent(readRecent());
    // On a results page, the panel starts from the search already shown.
    const current = pageQuery(window.location.pathname, new URLSearchParams(window.location.search));
    if (current && current !== startedFrom.current) {
      startedFrom.current = current;
      setText(current);
    } else if (current) setText((t) => t || current);
    dialog.current?.showModal();
    input.current?.select();
  }

  function close() {
    dialog.current?.close();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open();
      } else if (e.key === "/" && !isEditable(e.target)) {
        e.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKey);
    // Other search triggers (the home page's command bar) open the panel with this event.
    window.addEventListener("search:open", open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("search:open", open);
    };
  }, []);

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(normalizeSearch(query))}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as SearchResponse;
        setFound({ text: query, ...body });
        track("search", { results: Math.min(body.results.length, 20) });
        setActive(null);
        setExpanded(null);
      } catch (error) {
        if ((error as Error).name !== "AbortError")
          setFound({
            text: query,
            results: [],
            q,
            qty: 1,
            corrected: null,
            suggestions: [],
          });
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, query]);

  function add(result: SearchResult) {
    if (!result.variantId) return;
    saveRecent(text);
    addToCartNow(
      {
        variantId: result.variantId,
        title: result.title,
        options: "",
        sku: result.sku,
        image: result.image,
        href: result.href,
        supplierName: result.supplierName,
        unitPriceIls: result.priceIls,
      },
      qty,
    );
    showToast(qty > 1 ? `נוסף לסל ×${qty}` : "נוסף לסל");
  }

  function go(href: string) {
    saveRecent(text);
    close();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // A search field's own Escape only clears the text; here it closes the panel.
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" && ready && results.length > 0) {
      e.preventDefault();
      setActive((i) => (i === null ? 0 : Math.min(i + 1, results.length - 1)));
    } else if (e.key === "ArrowUp" && ready && results.length > 0) {
      e.preventDefault();
      setActive((i) => (i === null || i === 0 ? null : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Only a row the user picked, and only once the results are for what's typed.
      const picked = ready && active !== null ? results[active] : undefined;
      if (picked) go(picked.href);
      else if (q.length >= 2) go(catalogHref({ q: searchText }));
    }
  }

  const optionId = (i: number) => `${listId}-${i}`;
  const chip =
    "flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-caption hover:bg-subtle";

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={PLACEHOLDER}
        className="search-trigger group flex size-11 items-center justify-center gap-2.5 rounded-full text-muted sm:w-full sm:max-w-xl sm:justify-start sm:ps-1 sm:pe-4"
      >
        {/* The site's main search: a cobalt circle on phones, a glowing pill from 640px. */}
        <span aria-hidden className="btn-brand flex size-11 shrink-0 items-center justify-center rounded-full sm:size-9">
          <Search size={20} strokeWidth={2} />
        </span>
        <span className="hidden min-w-0 flex-1 text-callout transition-colors group-hover:text-foreground sm:flex">
          <Suspense fallback={<span className="min-w-0 truncate">{PLACEHOLDER}</span>}>
            <TriggerText />
          </Suspense>
        </span>
        <kbd
          className="hidden shrink-0 rounded-md bg-subtle px-2 py-0.5 font-sans text-caption text-muted md:inline"
          dir="ltr"
        >
          {shortcut}
        </kbd>
      </button>

      <dialog
        ref={dialog}
        aria-label="חיפוש"
        className="sheet sheet-search"
        onClick={(e) => e.target === dialog.current && close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search
              size={20}
              strokeWidth={1.75}
              className="shrink-0 text-muted"
              aria-hidden
            />
            <input
              ref={input}
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="חיפוש מוצר או מק״ט, ו-x4 לכמות"
              aria-label="חיפוש"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-activedescendant={
                active !== null && results[active]
                  ? optionId(active)
                  : undefined
              }
              autoComplete="off"
              enterKeyHint="search"
              className="h-14 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {qty > 1 && (
              <span className="shrink-0 rounded-full bg-subtle px-2.5 py-1 text-caption">
                כמות <Ltr>{qty}</Ltr>
              </span>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="סגירה"
              className="-me-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
            >
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          {q.length < 2 ? (
            <div className="flex-1 overflow-y-auto p-4">
              {recent.length > 0 && (
                <section className="mb-5">
                  <h2 className="mb-2 text-caption text-muted">
                    חיפושים אחרונים
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {recent.map((r) => (
                      <li key={r}>
                        <button
                          type="button"
                          onClick={() => setText(r)}
                          className={chip}
                        >
                          <Clock size={14} aria-hidden className="text-muted" />
                          <Ltr>{r}</Ltr>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="mb-5">
                <h2 className="mb-2 text-caption text-muted">לדוגמה</h2>
                <ul className="flex flex-wrap gap-2">
                  {searchExamples.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => setText(r)}
                        className={chip}
                      >
                        <Ltr>{r}</Ltr>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2 className="mb-2 text-caption text-muted">קטגוריות</h2>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {searchCategories.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={catalogHref({ category: c.slug })}
                        onClick={close}
                        className="flex min-h-11 items-center gap-3 rounded-xl p-1 hover:bg-subtle"
                      >
                        <CategoryIcon slug={c.slug} />
                        <span className="text-callout">{c.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : ready && results.length === 0 ? (
            <div className="flex-1 overflow-y-auto p-4">
              <ZeroResults
                q={searchText}
                suggestions={found.suggestions}
                onSuggest={setText}
                onNavigate={close}
              />
            </div>
          ) : (
            <ul
              id={listId}
              role="listbox"
              aria-label="תוצאות"
              aria-busy={searching}
              className={`flex-1 overflow-y-auto p-2 transition-opacity duration-200 ${searching ? "opacity-50" : ""}`}
            >
              {results.map((r, i) => {
                const choosable =
                  !r.variantId && r.optionKeys.length > 0 && r.variantCount > 1;
                return (
                  <li
                    key={r.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => ready && setActive(i)}
                    className={`rounded-xl p-2 ${i === active ? "bg-subtle" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <Link
                        href={r.href}
                        onClick={() => {
                          saveRecent(text);
                          close();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-tile">
                          {r.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              {...shopifyImage(r.image, 56)}
                              loading="lazy"
                              alt={r.title}
                              referrerPolicy="no-referrer"
                              className="size-full object-contain mix-blend-multiply"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <Ltr className="block truncate text-start text-callout font-medium">
                            {r.title}
                          </Ltr>
                          <span className="block truncate text-caption text-muted">
                            <Ltr>{r.supplierName}</Ltr>
                            {r.sku && (
                              <>
                                {", "}
                                <Ltr className="font-mono">{r.sku}</Ltr>
                              </>
                            )}
                            {r.variantCount > 1 &&
                              `, ${r.variantCount} אפשרויות`}
                          </span>
                        </span>
                        <span className="shrink-0 text-callout font-semibold">
                          {r.priceIls === null ? (
                            <span className="text-caption font-normal text-muted">
                              ייבדק בהצעה
                            </span>
                          ) : (
                            <>
                              {r.fromPrice && (
                                <span className="text-caption font-normal text-muted">
                                  החל מ-
                                </span>
                              )}
                              <span>{formatIls(r.priceIls)}</span>
                            </>
                          )}
                        </span>
                      </Link>
                      {canAdd && r.variantId && (
                        <button
                          type="button"
                          onClick={() => add(r)}
                          aria-label={`הוספה לסל: ${r.title}`}
                          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-transform active:scale-90"
                        >
                          <Plus size={20} strokeWidth={2} aria-hidden />
                        </button>
                      )}
                      {canAdd && choosable && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((id) => (id === r.id ? null : r.id))
                          }
                          aria-expanded={expanded === r.id}
                          aria-label={`בחירת אפשרויות: ${r.title}`}
                          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-brand hover:bg-subtle"
                        >
                          <ChevronDown
                            size={20}
                            aria-hidden
                            className={`transition-transform ${expanded === r.id ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>
                    {expanded === r.id && (
                      <div className="mt-2">
                        <FamilyCard family={asCard(r)} layout="row" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {q.length >= 2 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-caption text-muted">
              <span aria-live="polite">
                {searching && results.length === 0 ? (
                  "מחפש…"
                ) : ready && results.length === 0 ? (
                  "לא נמצאו מוצרים"
                ) : ready && found.corrected ? (
                  <>
                    תוצאות עבור <Ltr>{found.corrected}</Ltr>
                  </>
                ) : (
                  "חיצים לבחירה, Enter לכל התוצאות"
                )}
              </span>
              <Link
                href={catalogHref({ q: searchText })}
                onClick={() => {
                  saveRecent(text);
                  close();
                }}
                className="flex min-h-11 items-center text-brand hover:underline"
              >
                כל התוצאות
              </Link>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
