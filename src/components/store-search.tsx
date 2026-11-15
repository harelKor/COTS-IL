"use client";

import { ChevronLeft, Search, X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { SearchResponse, SearchResult } from "@/app/api/search/route";
import { formatIls } from "@/domain/pricing";
import { shopifyImage } from "@/lib/images";
import { Ltr } from "./ltr";

/** How many parts the dropdown shows before "כל התוצאות". */
const SHOWN = 3;

/**
 * Search inside one vendor's store. It's a GET form to the store (so it works before the page
 * hydrates, and Enter opens the full results); while typing, a dropdown shows the vendor's best
 * three matches and a "כל התוצאות" button to the full list. Arrow keys move through it, Enter opens
 * the highlighted part, Escape closes it.
 */
export function StoreSearch({ action, vendor, vendorName, q }: { action: string; vendor: string; vendorName: string; q: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [text, setText] = useState(q);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = text.trim();

  useEffect(() => {
    // Under two letters the dropdown is hidden (`shown`), so the last results can simply stay.
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&vendor=${encodeURIComponent(vendor)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as SearchResponse;
        setResults(data.results.slice(0, SHOWN));
        setActive(-1);
      } catch {
        // Aborted by the next keystroke, or offline: the form still searches on Enter.
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, vendor]);

  const shown = open && query.length >= 2 && results !== null;
  const items = results ?? [];
  // The rows the arrow keys move over: the parts, then "כל התוצאות".
  const count = items.length + 1;
  const optionId = (i: number) => `${id}-o${i}`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % count);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? count - 1 : a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter" && active >= 0 && active < items.length) {
      e.preventDefault();
      setOpen(false);
      router.push(items[active].href);
    }
  };

  return (
    <Form
      ref={form}
      action={action}
      role="search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      className="store-search relative w-full shrink-0 rounded-2xl lg:w-[540px] xl:w-[620px]"
    >
      <label htmlFor={`${id}-q`} className="sr-only">
        חיפוש ב-{vendorName}
      </label>
      <Search size={22} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute inset-y-0 start-5 my-auto text-brand" />
      <input
        ref={input}
        id={`${id}-q`}
        name="q"
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        enterKeyHint="search"
        role="combobox"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? optionId(active) : undefined}
        placeholder={`חיפוש ב-${vendorName}...`}
        className="h-[60px] w-full rounded-2xl bg-transparent ps-14 pe-14 text-[18px] outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />
      {text && (
        // Clears the box and keeps typing in it; the dropdown closes until the next letter.
        <button
          type="button"
          aria-label="ניקוי החיפוש"
          onClick={() => {
            setText("");
            setResults(null);
            setActive(-1);
            input.current?.focus();
          }}
          className="absolute inset-y-0 end-2 my-auto flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
        >
          <X size={20} strokeWidth={2} aria-hidden />
        </button>
      )}
      {shown && (
        <div className="store-search-menu absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl p-1.5">
          <ul id={`${id}-list`} role="listbox" aria-label={`תוצאות ב-${vendorName}`} className="flex flex-col">
            {items.map((r, i) => (
              <li key={r.id} id={optionId(i)} role="option" aria-selected={active === i}>
                <Link
                  href={r.href}
                  tabIndex={-1}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex min-h-14 items-center gap-3 rounded-xl px-2.5 py-2 ${active === i ? "bg-subtle-hover" : "hover:bg-subtle"}`}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-tile p-1">
                    {r.image && (
                      // Hot-linked from the supplier's CDN, like every catalog photo.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img {...shopifyImage(r.image, 96)} alt="" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Ltr className="truncate text-start text-callout font-medium">{r.title}</Ltr>
                    <span className="truncate text-caption text-muted">
                      {r.sku ? <Ltr className="font-mono">{r.sku}</Ltr> : r.variantCount > 1 ? `${r.variantCount.toLocaleString("he-IL")} אפשרויות` : null}
                    </span>
                  </span>
                  {/* The price only when the part is this vendor's alone (a shared part's price may be another vendor's). */}
                  {r.priceIls !== null && r.supplierName === vendorName && (
                    <span className="card-price shrink-0 text-callout font-semibold">
                      {r.fromPrice ? `החל מ-${formatIls(r.priceIls)}` : formatIls(r.priceIls)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
            {items.length === 0 && <li className="px-3 py-3 text-callout text-muted">אין התאמות מהירות ב-{vendorName}.</li>}
            <li id={optionId(items.length)} role="option" aria-selected={active === items.length}>
              <button
                type="submit"
                tabIndex={-1}
                onMouseEnter={() => setActive(items.length)}
                className={`mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-t border-line px-3 text-callout font-medium text-brand ${
                  active === items.length ? "bg-subtle-hover" : "hover:bg-subtle"
                }`}
              >
                <span>
                  כל התוצאות ל-<Ltr>&quot;{query}&quot;</Ltr>
                </span>
                <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
              </button>
            </li>
          </ul>
        </div>
      )}
    </Form>
  );
}
