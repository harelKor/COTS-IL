import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { accentStyle, vendorBlurb, vendorColumns, vendorHref } from "@/domain/vendors";
import type { VendorSummary } from "@/lib/catalog";
import { PhotoFan } from "./category-showcase";
import { Ltr } from "./ltr";

/** Desktop column classes by count (static strings, so Tailwind keeps them). */
const LG_COLS = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" } as const;

/**
 * The way into the site: one big box per vendor in the `suppliers` table (a vendor added in the
 * admin appears by itself), with its logo or name, its biggest categories, how many products,
 * and photos of its most wanted parts, tinted with its accent. The whole box is one link.
 * Up to 4 vendors stack one per row on a phone; more go two per row in a shorter box.
 */
export function VendorBoxes({ vendors }: { vendors: VendorSummary[] }) {
  const compact = vendors.length > 4;
  return (
    <ul
      className={`mx-auto grid gap-3 sm:grid-cols-2 sm:gap-4 ${compact ? "grid-cols-2" : "grid-cols-1"} ${LG_COLS[vendorColumns(vendors.length)]} ${
        vendors.length <= 2 ? "max-w-3xl" : "w-full"
      }`}
    >
      {vendors.map((v) => {
        const blurb = vendorBlurb(v.categories);
        return (
          <li key={v.code}>
            <Link
              href={vendorHref(v.code)}
              style={accentStyle(v.accentColor, v.accentColor2)}
              className={`group glow-box flex h-full transition-[translate] duration-200 ease-out hover:-translate-y-0.5 lg:min-h-[300px] lg:flex-col lg:items-stretch lg:gap-4 lg:p-6 ${
                compact ? "min-h-[200px] flex-col gap-3 p-4 sm:min-h-[132px] sm:flex-row sm:items-center sm:gap-4 sm:p-5" : "min-h-[132px] items-center gap-4 p-5"
              }`}
            >
              <span className="flex min-w-0 flex-1 flex-col items-start gap-2 lg:order-1 lg:flex-none">
                {v.logoUrl && (
                  // The vendor's own logo (S16b), from its store or the logos bucket.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.logoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-8 max-w-[140px] object-contain object-start" />
                )}
                <Ltr className={`text-brand-gradient leading-tight font-semibold tracking-tight ${compact ? "text-[20px] sm:text-[28px]" : "text-[24px] sm:text-[28px]"}`}>{v.name}</Ltr>
                {blurb && <span className={`text-caption leading-snug text-muted ${compact ? "line-clamp-2" : ""}`}>{blurb}</span>}
                <span className="rounded-full bg-brand-soft/70 px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
                  {v.count.toLocaleString("he-IL")} מוצרים
                </span>
              </span>
              <span
                className={`relative flex shrink-0 items-center justify-center lg:order-2 lg:h-40 lg:w-full lg:scale-125 ${compact ? "order-first h-20 w-full sm:order-none sm:h-24 sm:w-32" : "h-24 w-32"}`}
              >
                <PhotoFan images={v.images} />
              </span>
              <span className="hidden items-center gap-1 text-callout font-semibold text-brand lg:order-3 lg:mt-auto lg:flex">
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
