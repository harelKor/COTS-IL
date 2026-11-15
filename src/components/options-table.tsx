"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clampQty } from "@/domain/cart";
import { compareOptionValues } from "@/domain/families/sort";
import { isFresh } from "@/lib/availability-text";
import { addToCartNow, type AddableLine } from "./cart-actions";
import { canEditCart, useCart } from "./cart-store";

/** Rows shown before "הצגת כל N". */
const FIRST_ROWS = 6;

/**
 * The family page's "all options" table, a section of the page (PP4) with its first rows showing
 * and "הצגת כל N" opening the rest in place. It can run to hundreds of rows, so the server renders
 * it as HTML (/catalog/p/[slug]/options, cached) and it loads as it nears the screen. "הצגה כטבלה"
 * in the options area opens it (an "options:open" event on it). A status whose check date is too
 * old reads "not verified", as everywhere else. Each row has a quantity and Add; a column heading
 * sorts by that column.
 */
export function OptionsTable({ slug, count, children }: { slug: string; count: number; children: React.ReactNode }) {
  const [html, setHtml] = useState<string | null>(null);
  const [all, setAll] = useState(count <= FIRST_ROWS + 2);
  const loading = useRef(false);
  const section = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const sorted = useRef<{ column: number; dir: 1 | -1 } | null>(null);
  const { mode } = useCart();
  const canAdd = canEditCart(mode);

  function load() {
    if (loading.current) return;
    loading.current = true;
    fetch(`/catalog/p/${encodeURIComponent(slug)}/options`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then(setHtml)
      .catch(() => (loading.current = false));
  }

  // Loads as it nears the screen, or when "הצגה כטבלה" asks for all of it.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && load(), { rootMargin: "600px 0px" });
    io.observe(el);
    const open = () => {
      setAll(true);
      load();
    };
    el.addEventListener("options:open", open);
    return () => {
      io.disconnect();
      el.removeEventListener("options:open", open);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const now = Date.now();
    for (const el of box.current?.querySelectorAll<HTMLElement>("[data-checked]") ?? []) {
      if (!isFresh(el.dataset.checked!, now)) {
        el.textContent = "זמינות לא אומתה";
        el.className = "text-caption text-muted";
      }
    }
  }, [html]);

  function sortBy(column: number, th: HTMLElement) {
    const body = box.current?.querySelector("tbody");
    if (!body) return;
    const dir = sorted.current?.column === column && sorted.current.dir === 1 ? -1 : 1;
    sorted.current = { column, dir };
    const value = (row: Element) => (row.children[column] as HTMLElement | undefined)?.dataset.value ?? "";
    const rows = [...body.children].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const nx = Number(x);
      const ny = Number(y);
      const byNumber = x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny);
      return dir * (byNumber ? nx - ny : compareOptionValues(x, y));
    });
    body.append(...rows);
    for (const other of th.parentElement?.children ?? []) other.setAttribute("aria-sort", "none");
    th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
  }

  function onClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const sort = target.closest<HTMLElement>("[data-sort]");
    if (sort) return sortBy(Number(sort.dataset.sort), sort.closest("th")!);
    const button = target.closest<HTMLElement>("[data-add]");
    if (!button || !canAdd) return;
    const row = button.closest<HTMLElement>("tr[data-line]");
    const input = row?.querySelector<HTMLInputElement>("[data-qty]");
    if (!row || !input) return;
    const qty = clampQty(Number(input.value.replace(/[^\d]/g, "")) || 1);
    addToCartNow(JSON.parse(row.dataset.line!) as AddableLine, qty, button);
    input.value = "1";
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>("[data-qty]");
    if (input && e.key === "Enter") input.closest("tr")?.querySelector<HTMLElement>("[data-add]")?.click();
  }

  return (
    <section ref={section} data-options-table data-jump={`כל האפשרויות (${count.toLocaleString("he-IL")})`} className="pdp-section flex scroll-mt-32 flex-col gap-4">
      {children}
      {html === null ? (
        <div className="flex flex-col gap-3 py-2" aria-busy>
          {Array.from({ length: Math.min(count, FIRST_ROWS) }, (_, i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      ) : (
        // Clicks and Enter are handled here for every row: the rows are server HTML, not React.
        <div
          ref={box}
          onClick={onClick}
          onKeyDown={onKeyDown}
          data-collapsed={all ? undefined : ""}
          className={`pdp-table overflow-x-auto ${canAdd ? "" : "[&_[data-add]]:hidden [&_[data-qty]]:hidden"}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {!all && (
        <button type="button" onClick={() => setAll(true)} className="btn-soft flex h-11 items-center gap-2 self-center rounded-full px-6 text-callout font-medium">
          הצגת כל {count.toLocaleString("he-IL")}
          <ChevronDown size={18} aria-hidden />
        </button>
      )}
    </section>
  );
}
