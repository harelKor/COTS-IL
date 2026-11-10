"use client";

import { useEffect, useRef, useState } from "react";
import { isFresh } from "@/lib/availability-text";

/**
 * The family page's "all options" table. It can run to hundreds of rows, so it isn't
 * part of the page: the server renders it as HTML (/catalog/p/[slug]/options, cached)
 * and it loads when the list is opened, or when the pointer heads for it.
 * A status whose check date is too old reads "not verified", as everywhere else.
 */
export function OptionsTable({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [html, setHtml] = useState<string | null>(null);
  const loading = useRef(false);
  const box = useRef<HTMLDivElement>(null);

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

  return (
    <details className="group rounded-card bg-surface" onToggle={(e) => e.currentTarget.open && load()} onPointerEnter={load}>
      {children}
      {html === null ? (
        <div className="flex flex-col gap-2 border-t border-line p-4" aria-busy>
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-2/3" />
        </div>
      ) : (
        <div ref={box} className="max-h-[32rem] overflow-auto border-t border-line" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </details>
  );
}
