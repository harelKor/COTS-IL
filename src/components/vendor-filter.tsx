"use client";

import { Check, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { darkLogo, vendorPalette, vendorTheme } from "@/domain/vendors";
import { Ltr } from "./ltr";

export type VendorOption = { code: string; name: string; count: number; logoUrl?: string | null; accentColor?: string | null; accentColor2?: string | null };

/**
 * The catalog's vendor strip, above everything else: one tile per vendor in its own colours
 * (vendorPalette) on dark glass, its logo in white ink like the home page's boxes, with its name and
 * how many products match under it (some logos are only a mark). Always every vendor, in one fixed
 * order (the home page's, CF3), so nothing moves between views; one with nothing here is dimmed.
 *
 * Several can be on at once (OR between them): a tap adds or removes one, "כל הספקים" clears them.
 * On a wide window the tiles share the row; when they don't fit it scrolls sideways, the edges fade
 * where more tiles are hidden and arrows scroll by most of a row.
 */
export function VendorFilter({ vendors, value, onToggle, onClear }: { vendors: VendorOption[]; value: string[]; onToggle: (code: string) => void; onClear: () => void }) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    // scrollLeft runs from 0 toward negative in RTL, so its size is how far along the row is.
    const update = () => {
      const along = Math.abs(el.scrollLeft);
      const start = along > 8;
      const end = el.scrollWidth - el.clientWidth - along > 8;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  // The first chosen vendor (in the strip's order) is in view on a phone too, clear of the faded
  // edges and their arrows: the row (not the page) scrolls to it.
  const first = vendors.find((v) => value.includes(v.code))?.code;
  useEffect(() => {
    const el = row.current;
    const on = first ? el?.querySelector<HTMLElement>(`[data-code="${CSS.escape(first)}"]`) : null;
    if (!el || !on) return;
    const a = on.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (a.left < b.left + 64 || a.right > b.right - 64) el.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
  }, [first]);

  const scroll = (toward: "start" | "end") => {
    const el = row.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const sign = (toward === "end" ? 1 : -1) * (rtl ? -1 : 1);
    el.scrollBy({ left: sign * el.clientWidth * 0.7, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const none = value.length === 0;
  const tile = (on: boolean, empty = false) =>
    `glow-box relative flex h-[76px] min-w-[120px] shrink-0 flex-col items-center justify-center gap-1.5 px-3 py-2 transition-[translate,opacity] duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none lg:flex-auto ${
      on ? "vendor-tile-on" : empty ? "opacity-45" : !none ? "opacity-75 hover:opacity-100" : ""
    }`;
  const tick = (
    <span aria-hidden className="btn-brand absolute -top-1.5 -end-1.5 flex size-6 items-center justify-center rounded-full">
      <Check size={14} strokeWidth={2.5} />
    </span>
  );
  const arrow = (toward: "start" | "end") => (
    <button
      type="button"
      onClick={() => scroll(toward)}
      tabIndex={-1}
      aria-hidden
      className={`absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center ${toward === "start" ? "start-0" : "end-0"}`}
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-surface text-foreground shadow-card ring-1 ring-line">
        {/* In RTL the start is on the right: → leads back, ← leads on. */}
        {toward === "start" ? <ChevronRight size={18} strokeWidth={2} className="ltr:rotate-180" /> : <ChevronLeft size={18} strokeWidth={2} className="ltr:rotate-180" />}
      </span>
    </button>
  );

  return (
    <section aria-label="ספקים" className="relative -mx-6 md:-mx-12 lg:-mx-3">
      {/* Its own row (not ScrollRow): room above and below for the glow, the ring and the tick. */}
      <div
        ref={row}
        role="group"
        aria-label="סינון לפי ספק"
        data-start={edges.start || undefined}
        data-end={edges.end || undefined}
        className="vendor-row no-scrollbar flex gap-2 overflow-x-auto px-6 pt-3 pb-5 md:px-12 lg:px-3"
      >
        <button type="button" aria-pressed={none} onClick={onClear} className={`${tile(none)} lg:max-w-[152px]`}>
          {none && tick}
          <LayoutGrid size={22} strokeWidth={1.75} aria-hidden className="text-brand" />
          <span className="text-caption font-semibold lg:text-callout">כל הספקים</span>
        </button>
        {vendors.map((v) => {
          const on = value.includes(v.code);
          const logo = v.logoUrl ? (darkLogo(v.logoUrl) ?? v.logoUrl) : null;
          return (
            <button
              key={v.code}
              type="button"
              data-code={v.code}
              aria-pressed={on}
              onClick={() => onToggle(v.code)}
              style={{ ...vendorTheme(v), "--accent": vendorPalette(v).primary } as React.CSSProperties}
              className={tile(on, v.count === 0)}
            >
              {on && tick}
              {logo && (
                // The vendor's own logo, the same one as on the home boxes; the name below says who it is.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt=""
                  referrerPolicy="no-referrer"
                  className={`h-7 w-auto max-w-[120px] object-contain vendor-logo ${darkLogo(v.logoUrl ?? null) ? "" : "vendor-logo-invert"}`}
                />
              )}
              <span className="flex max-w-full items-baseline gap-1.5 text-caption leading-tight whitespace-nowrap">
                <Ltr className={`font-semibold ${logo ? "" : "text-brand-gradient text-callout"}`}>{v.name}</Ltr>
                <span className="text-muted tabular-nums">
                  {v.count.toLocaleString("he-IL")}
                  <span className="sr-only"> מוצרים</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {edges.start && arrow("start")}
      {edges.end && arrow("end")}
    </section>
  );
}
