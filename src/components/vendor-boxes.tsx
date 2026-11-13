import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { aliveStyle } from "@/domain/alive";
import { accentStyle, vendorBlurb, vendorHref, vendorSpans } from "@/domain/vendors";
import type { VendorSummary } from "@/lib/catalog";
import { shopifyImage } from "@/lib/images";
import { Ltr } from "./ltr";

/** Static class names, so Tailwind keeps them: a box's span at 640px (of 2) and 1024px (of 6). */
const SM_SPAN = { 1: "", 2: "sm:col-span-2" } as const;
const LG_SPAN = { 2: "lg:col-span-2", 3: "lg:col-span-3", 6: "lg:col-span-6" } as const;
/** Photos beyond the third show only when the box is wide enough (container queries on the box). */
const PHOTO_SHOW = ["", "", "", "hidden @lg:flex", "hidden @2xl:flex", "hidden @2xl:flex"];
/** Columns for the photos shown at each box width, so a short list never leaves an empty cell. */
const COLS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"];
const COLS_LG = ["", "", "", "", "@lg:grid-cols-4"];
const COLS_2XL = ["", "", "", "", "@2xl:grid-cols-4", "@2xl:grid-cols-5", "@2xl:grid-cols-6"];

/**
 * The vendor's most wanted parts, side by side on white tiles, clipped inside the box: 3 in a
 * normal box, 4 in a half-row box, 6 across a full-row one. Each tile hops now and then, on its own beat.
 */
function PhotoRow({ images, seed }: { images: string[]; seed: string }) {
  if (images.length === 0) return null;
  const shown = images.slice(0, 6);
  return (
    <span
      className={`grid gap-2 overflow-hidden rounded-2xl p-1 sm:gap-3 @4xl:max-w-[680px] @4xl:flex-1 ${COLS[Math.min(3, shown.length)]} ${COLS_LG[Math.min(4, shown.length)]} ${COLS_2XL[shown.length]}`}
    >
      {shown.map((src, i) => (
        <span
          key={src}
          style={aliveStyle(`${seed}:${i}`) as React.CSSProperties}
          className={`alive-tile tile-fade aspect-square items-center justify-center overflow-hidden rounded-xl p-2 ${PHOTO_SHOW[i] || "flex"}`}
        >
          {/* Hot-linked from the supplier's CDN, like every catalog photo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...shopifyImage(src, 200)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full object-contain mix-blend-multiply transition-transform duration-300 ease-out group-hover:scale-105"
          />
        </span>
      ))}
    </span>
  );
}

/**
 * The way into the site: one box per vendor in the `suppliers` table (a vendor added in the admin
 * appears by itself), with its logo and name, its biggest categories, how many products and a row
 * of its most wanted parts, tinted with its brand colours. Up to 3 per row, so names fit on one
 * line, and the last row is always full (vendorSpans): a lone last box spans the row with more
 * photos. The whole box is one link to its store.
 */
export function VendorBoxes({ vendors }: { vendors: VendorSummary[] }) {
  const spans = vendorSpans(vendors.length);
  return (
    <ul className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
      {vendors.map((v, i) => {
        const blurb = vendorBlurb(v.categories);
        return (
          <li key={v.code} className={`@container ${SM_SPAN[spans[i].sm]} ${LG_SPAN[spans[i].lg]}`}>
            <Link
              href={vendorHref(v.code)}
              style={accentStyle(v.accentColor, v.accentColor2)}
              className="group glow-box flex h-full flex-col gap-4 p-5 transition-[translate] duration-200 ease-out hover:-translate-y-0.5 lg:p-6 @4xl:flex-row @4xl:items-center @4xl:gap-8"
            >
              <span className="flex items-start justify-between gap-3 @4xl:w-72 @4xl:shrink-0">
                <span className="flex min-w-0 flex-col items-start gap-1.5">
                  {v.logoUrl && (
                    // The vendor's own logo (S16b), from its store or the logos bucket.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.logoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-7 max-w-[140px] object-contain object-start" />
                  )}
                  <Ltr className="text-brand-gradient text-[24px] leading-tight font-semibold tracking-tight sm:text-[28px]">{v.name}</Ltr>
                  {blurb && <span className="line-clamp-2 text-caption leading-snug text-muted">{blurb}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-brand-soft/70 px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
                  {v.count.toLocaleString("he-IL")} מוצרים
                </span>
              </span>
              <PhotoRow images={v.images} seed={v.code} />
              <span className="mt-auto flex items-center gap-1 text-callout font-semibold text-brand @4xl:mt-0 @4xl:shrink-0">
                לחנות
                <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
