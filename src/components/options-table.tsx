"use client";

import { useEffect, useRef, useState } from "react";
import { clampQty } from "@/domain/cart";
import { compareOptionValues } from "@/domain/families/sort";
import { isFresh } from "@/lib/availability-text";
import { addToCartNow, type AddableLine } from "./cart-actions";
import { canEditCart, useCart } from "./cart-store";

/**
 * The family page's "all options" table. It can run to hundreds of rows, so it isn't
 * part of the page: the server renders it as HTML (/catalog/p/[slug]/options, cached)
 * and it loads when the list is opened, or when the pointer heads for it.
 * A status whose check date is too old reads "not verified", as everywhere else.
 * Each row has a quantity and Add; a column heading sorts by that column.
 */
export function OptionsTable({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [html, setHtml] = useState<string | null>(null);
  const loading = useRef(false);
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
    <details data-options-table className="group scroll-mt-20 rounded-card bg-surface" onToggle={(e) => e.currentTarget.open && load()} onPointerEnter={load}>
      {children}
      {html === null ? (
        <div className="flex flex-col gap-2 border-t border-line p-4" aria-busy>
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-2/3" />
        </div>
      ) : (
        // Clicks and Enter are handled here for every row: the rows are server HTML, not React.
        <div
          ref={box}
          onClick={onClick}
          onKeyDown={onKeyDown}
          className={`max-h-[32rem] overflow-auto border-t border-line ${canAdd ? "" : "[&_[data-add]]:hidden [&_[data-qty]]:hidden"}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </details>
  );
}
