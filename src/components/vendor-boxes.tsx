import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { aliveStyle } from "@/domain/alive";
import { spansBoth, vendorBlurb, vendorHref } from "@/domain/vendors";
import type { VendorSummary } from "@/lib/catalog";
import { shopifyImage } from "@/lib/images";
import { VendorMark } from "./vendor-mark";

/** Static class names, so Tailwind keeps them: the first row's columns from 1024px, by how many it holds. */
const ROW_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3"];
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
          className={`alive-tile scene-thumb aspect-square items-center justify-center overflow-hidden rounded-xl p-2 ${PHOTO_SHOW[i] || "flex"}`}
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
 * appears by itself), with its logo on a white pill, its biggest categories, how many products and
 * a row of its most wanted parts on white tiles, in dark glass over the home photos. The whole box
 * is one link to its store.
 * - "row": the first row, up to 3 across from 1024px, under the tall robot.
 * - "bento": the rest, two to a row from 640px (beside the short robot on a desktop).
 * A lone last box spans both columns of a 2-column row (spansBoth), so no row has a gap.
 */
export function VendorBoxes({ vendors, layout, eager = 0 }: { vendors: VendorSummary[]; layout: "row" | "bento"; eager?: number }) {
  const cols = layout === "row" ? ROW_COLS[Math.min(3, vendors.length)] : "";
  return (
    <ul className={`grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5 ${cols}`}>
      {vendors.map((v, i) => {
        const blurb = vendorBlurb(v.categories);
        const wide = spansBoth(i, vendors.length) ? `sm:col-span-2 ${layout === "row" ? "lg:col-span-1" : ""}` : "";
        return (
          <li key={v.code} className={`@container ${wide}`}>
            <Link
              href={vendorHref(v.code)}
              className="group glass-dark flex h-full flex-col gap-4 p-5 hover:-translate-y-0.5 lg:p-6"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col items-start gap-2">
                  {/* The heading is the vendor's logo (alt = its name), or its name when it has none, on a white pill. */}
                  <h3 className="logo-pill flex min-h-12 items-center rounded-xl bg-white/95 px-3.5 py-1.5 shadow-sm">
                    <VendorMark name={v.name} logoUrl={v.logoUrl} size="pill" eager={i < eager} />
                  </h3>
                  {blurb && <span className="line-clamp-2 text-caption leading-snug text-muted">{blurb}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
                  {v.count.toLocaleString("he-IL")} מוצרים
                </span>
              </span>
              <PhotoRow images={v.images} seed={v.code} />
              <span className="mt-auto flex items-center gap-1 text-callout font-semibold text-brand">
                לחנות
                <ChevronLeft size={20} strokeWidth={1.75} aria-hidden className="transition-transform duration-300 ease-out group-hover:-translate-x-0.5" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
