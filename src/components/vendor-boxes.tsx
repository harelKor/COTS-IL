import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { vendorBlurb, vendorHref } from "@/domain/vendors";
import type { VendorSummary } from "@/lib/catalog";
import { PhotoFan } from "./category-showcase";
import { Ltr } from "./ltr";

/**
 * The way into the site: one big box per vendor, its name, what teams buy there, how many
 * products, and photos of its most wanted parts. The whole box is one link to its store.
 */
export function VendorBoxes({ vendors }: { vendors: VendorSummary[] }) {
  return (
    <ul className={`grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 ${vendors.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
      {vendors.map((v) => {
        const blurb = vendorBlurb(v.code);
        return (
          <li key={v.code}>
            <Link
              href={vendorHref(v.code)}
              aria-label={`החנות של ${v.name}, ${v.count.toLocaleString("he-IL")} מוצרים`}
              className={`group glow-box accent-${v.code} flex h-full min-h-[132px] items-center gap-4 p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift lg:min-h-[300px] lg:flex-col lg:items-stretch lg:p-6`}
            >
              <span className="flex min-w-0 flex-1 flex-col items-start gap-2 lg:order-1 lg:flex-none">
                <Ltr className="text-brand-gradient text-[24px] leading-tight font-semibold tracking-tight sm:text-[28px]">{v.name}</Ltr>
                {blurb && <span className="text-caption leading-snug text-muted">{blurb}</span>}
                <span className="rounded-full bg-brand-soft/70 px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
                  {v.count.toLocaleString("he-IL")} מוצרים
                </span>
              </span>
              <span className="relative flex h-24 w-32 shrink-0 items-center justify-center lg:order-2 lg:h-40 lg:w-full lg:scale-125">
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
