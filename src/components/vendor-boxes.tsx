import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { accentStyle, vendorBlurb, vendorHref } from "@/domain/vendors";
import type { VendorSummary } from "@/lib/catalog";
import { shopifyImage } from "@/lib/images";
import { Ltr } from "./ltr";

/** Desktop columns: as many as there are vendors up to 3, then rows of 3 (static strings, so Tailwind keeps them). */
const LG_COLS = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" } as const;

/** Three of the vendor's most wanted parts, side by side on white tiles, clipped inside the box. */
function PhotoRow({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <span className="grid grid-cols-3 gap-2 overflow-hidden rounded-2xl sm:gap-3">
      {images.slice(0, 3).map((src) => (
        <span key={src} className="tile-fade flex aspect-square items-center justify-center overflow-hidden rounded-xl p-2">
          {/* Hot-linked from the supplier's CDN, like every catalog photo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...shopifyImage(src, 160)}
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
 * line; the whole box is one link to its store.
 */
export function VendorBoxes({ vendors }: { vendors: VendorSummary[] }) {
  const cols = Math.min(3, Math.max(1, vendors.length)) as 1 | 2 | 3;
  return (
    <ul className={`mx-auto grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5 ${LG_COLS[cols]} ${vendors.length === 1 ? "max-w-xl" : ""}`}>
      {vendors.map((v) => {
        const blurb = vendorBlurb(v.categories);
        return (
          <li key={v.code}>
            <Link
              href={vendorHref(v.code)}
              style={accentStyle(v.accentColor, v.accentColor2)}
              className="group glow-box flex h-full flex-col gap-4 p-5 transition-[translate] duration-200 ease-out hover:-translate-y-0.5 lg:p-6"
            >
              <span className="flex items-start justify-between gap-3">
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
              <PhotoRow images={v.images} />
              <span className="mt-auto flex items-center gap-1 text-callout font-semibold text-brand">
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
