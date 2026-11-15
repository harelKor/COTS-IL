"use client";

import { Check, LayoutGrid } from "lucide-react";
import { useEffect, useRef } from "react";
import { darkLogo, vendorPalette, vendorTheme } from "@/domain/vendors";
import { Ltr } from "./ltr";

export type VendorOption = { code: string; name: string; count: number; logoUrl?: string | null; accentColor?: string | null; accentColor2?: string | null };

/**
 * The catalog's main filter, above everything else: one big tile per vendor in its own colours
 * (vendorPalette) on dark glass, with its logo in white ink like the home page's boxes (alt = its
 * name; the name when there is no logo) and how many products match.
 * A sideways row on every width; the chosen tile is ticked and outlined, and a second tap clears it.
 */
export function VendorFilter({ vendors, value, onChange }: { vendors: VendorOption[]; value: string; onChange: (code: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  // The chosen vendor is in view on a phone too: the row (not the page) scrolls to it.
  useEffect(() => {
    const el = row.current;
    const on = el?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!el || !on) return;
    const a = on.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (a.left < b.left || a.right > b.right) el.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
  }, [value]);
  const tile = (on: boolean) =>
    `glow-box relative flex h-16 shrink-0 flex-col items-center justify-center gap-0.5 px-4 py-3 transition-[translate,opacity] duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
      on ? "vendor-tile-on" : value ? "opacity-70 hover:opacity-100" : ""
    }`;
  const tick = (
    <span aria-hidden className="btn-brand absolute -top-1.5 -end-1.5 flex size-6 items-center justify-center rounded-full">
      <Check size={14} strokeWidth={2.5} />
    </span>
  );
  return (
    <section aria-labelledby="vendor-filter" className="flex flex-col gap-2">
      <h2 id="vendor-filter" className="text-section font-semibold">
        ספק
      </h2>
      {/* Its own row (not ScrollRow): room above and below for the glow, the ring and the tick. */}
      <div ref={row} className="no-scrollbar scroll-fade-x -mx-6 -mt-1 flex gap-3 overflow-x-auto px-6 pt-3 pb-4 md:-mx-12 md:px-12">
        <button type="button" aria-pressed={!value} onClick={() => onChange("")} className={`${tile(!value)} min-w-[112px]`}>
          {!value && tick}
          <LayoutGrid size={20} strokeWidth={1.75} aria-hidden className="text-brand" />
          <span className="text-caption font-semibold">כל הספקים</span>
        </button>
        {vendors.map((v) => {
          const on = value === v.code;
          return (
            <button
              key={v.code}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? "" : v.code)}
              style={{ ...vendorTheme(v), "--accent": vendorPalette(v).primary } as React.CSSProperties}
              className={`${tile(on)} min-w-[136px]`}
            >
              {on && tick}
              {v.logoUrl ? (
                // The vendor's own logo, the same one as on the home boxes.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={darkLogo(v.logoUrl) ?? v.logoUrl}
                  alt={v.name}
                  referrerPolicy="no-referrer"
                  className={`h-7 w-auto max-w-[120px] object-contain vendor-logo ${darkLogo(v.logoUrl) ? "" : "vendor-logo-invert"}`}
                />
              ) : (
                <Ltr className="text-brand-gradient text-body font-semibold leading-tight">{v.name}</Ltr>
              )}
              <span className="text-caption text-muted tabular-nums">{v.count.toLocaleString("he-IL")} מוצרים</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
