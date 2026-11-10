"use client";

import { Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { SearchResponse, SearchResult } from "@/app/api/search/route";
import { formatIls } from "@/domain/pricing";
import { catalogHref } from "@/lib/catalog-filters";
import { shopifyImage } from "@/lib/images";
import { normalizeSearch, parseQuickQuery } from "@/lib/quick-query";
import { addToCartNow } from "./cart-actions";
import { canEditCart, useCart } from "./cart-store";
import { Ltr } from "./ltr";
import { showToast } from "./toast";

/** Opens the search panel from anywhere on the site. */
export const openSearch = () => window.dispatchEvent(new Event("search:open"));

/** Typing in a field shouldn't open the panel when "/" is pressed. */
function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/**
 * Spotlight-style search: "/" or Ctrl/⌘K anywhere opens it, results come while
 * typing, and "+" (or Enter) adds a single-variant part to the cart without
 * leaving the page. A trailing "x4" sets the quantity.
 */
export function SearchPanel() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { mode } = useCart();
  const [text, setText] = useState("");
  // Results are kept with the text they answer, so stale ones never show.
  const [found, setFound] = useState<{ text: string } & SearchResponse>({ text: "", results: [], qty: 1 });
  const [active, setActive] = useState(0);
  const listId = useId();

  const { q, text: query } = parseQuickQuery(text);
  const ready = found.text === query;
  const results = q.length >= 2 && ready ? found.results : [];
  const qty = ready ? found.qty : parseQuickQuery(text).qty;
  const searching = q.length >= 2 && !ready;
  const canAdd = canEditCart(mode);

  function open() {
    if (dialog.current?.open) return;
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
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalizeSearch(query))}`, { signal: controller.signal });
        const body = (await response.json()) as SearchResponse;
        setFound({ text: query, ...body });
        setActive(0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFound({ text: query, results: [], qty: 1 });
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, query]);

  function add(result: SearchResult) {
    if (!result.variantId) return;
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
    close();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // A search field's own Escape only clears the text; here it closes the panel.
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = results[active];
      if (!result) {
        if (q) go(catalogHref({ q }));
      } else if (canAdd && result.variantId) {
        add(result);
      } else {
        go(result.href);
      }
    }
  }

  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="חיפוש מוצר או מק״ט"
        className="flex size-11 items-center justify-center gap-2 rounded-full border border-line bg-white/90 shadow-2xs hover:bg-subtle text-muted transition-colors hover:text-foreground sm:h-11 sm:w-full sm:max-w-md sm:justify-start sm:px-4 sm:text-caption"
      >
        <Search size={16} strokeWidth={1.75} aria-hidden className="max-sm:size-5" />
        <span className="hidden flex-1 truncate text-start sm:block">חיפוש מוצר או מק״ט</span>
        <kbd className="hidden font-sans text-[11px] text-muted sm:inline" dir="ltr">
          Ctrl K
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
            <Search size={20} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
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
              aria-activedescendant={results[active] ? optionId(active) : undefined}
              autoComplete="off"
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

          <ul id={listId} role="listbox" aria-label="תוצאות" className="flex-1 overflow-y-auto p-2">
            {results.map((r, i) => (
              <li
                key={r.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                className={`flex items-center gap-3 rounded-xl p-2 ${i === active ? "bg-subtle" : ""}`}
              >
                <Link href={r.href} onClick={close} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-tile">
                    {r.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img {...shopifyImage(r.image, 56)} loading="lazy" alt={r.title} referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Ltr className="block truncate text-start text-[15px] font-medium">{r.title}</Ltr>
                    <span className="block truncate text-caption text-muted">
                      <Ltr>{r.supplierName}</Ltr>
                      {r.sku && (
                        <>
                          {", "}
                          <Ltr className="font-mono">{r.sku}</Ltr>
                        </>
                      )}
                      {r.variantCount > 1 && `, ${r.variantCount} אפשרויות`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[15px] font-semibold">
                    {r.priceIls === null ? (
                      <span className="text-caption font-normal text-muted">ייבדק בהצעה</span>
                    ) : (
                      <>
                        {r.fromPrice && <span className="text-caption font-normal text-muted">החל מ-</span>}
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
              </li>
            ))}
          </ul>

          {q.length >= 2 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-caption text-muted">
              <span aria-live="polite">
                {searching ? "מחפש…" : results.length === 0 ? "לא נמצאו מוצרים" : "חיצים לבחירה, Enter להוספה"}
              </span>
              <Link href={catalogHref({ q })} onClick={close} className="text-brand hover:underline">
                כל התוצאות
              </Link>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
