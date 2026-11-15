import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { aliveStyle } from "@/domain/alive";
import { spansBoth, vendorBlurb, vendorGlass, vendorHref } from "@/domain/vendors";
import type { VendorSummary } from "@/lib/catalog";
import { shopifyImage } from "@/lib/images";
import { VendorMark } from "./vendor-mark";
import { countOf, PRODUCT } from "@/domain/plural";

/** Static class names, so Tailwind keeps them: the first row's columns from 1024px, by how many it holds. */
const ROW_COLS = ["", "lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3"];
/** Photos beyond the third show only when the box is wide enough (container queries on the box). */
const PHOTO_SHOW = ["", "", "", "hidden @lg:flex", "hidden @2xl:flex", "hidden @2xl:flex"];
/** Columns for the photos shown at each box width, so a short list never leaves an empty cell. */
const COLS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"];
const COLS_LG = ["", "", "", "", "@lg:grid-cols-4"];
const COLS_2XL = ["", "", "", "", "@2xl:grid-cols-4", "@2xl:grid-cols-5", "@2xl:grid-cols-6"];

/**
 * The vendor's most wanted parts, side by side on pearl tiles, clipped inside the box: 3 in a
 * normal box, 4 in a half-row box, 6 across a full-row one. With a mouse, each tile hops now and
 * then, on its own beat (globals.css, `.alive-tile`).
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
 * appears by itself), with its logo straight on glass tinted in its own colour (white ink on dark glass
 * by night, its own colours on frosted white glass by day), its biggest categories, how many products
 * and a row of its most wanted parts on soft pearl tiles, over the home photos. The whole box is one
 * link to its store.
 * - "row": the first row, up to 3 across from 1024px, under the hero robot.
 * - "bento": the rest, two to a row from 640px (beside the Reefscape robot on a desktop).
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
              // The way into the site: the whole store is fetched ahead, so its click is instant.
              prefetch={true}
              style={vendorGlass(v) as React.CSSProperties}
              className="group glass-dark vendor-glass flex h-full flex-col gap-4 p-5 hover:-translate-y-0.5 lg:p-6"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col items-start gap-2.5">
                  {/* The heading is the vendor's logo (its name for screen readers) straight on the glass, or its name when it has none. */}
                  <h3 className="flex min-h-14 items-center">
                    <VendorMark name={v.name} logoUrl={v.logoUrl} size="card" eager={i < eager} />
                  </h3>
                  {blurb && <span className="line-clamp-2 text-caption leading-snug text-muted">{blurb}</span>}
                </span>
                <span className="vendor-count shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold tabular-nums">
                  {countOf(v.count, PRODUCT)}
                </span>
              </span>
              <PhotoRow images={v.images} seed={v.code} />
              <span className="vendor-go mt-auto flex items-center gap-1 text-callout font-semibold">
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
