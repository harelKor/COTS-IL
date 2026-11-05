import Link from "next/link";
import { ViewTransition } from "react";
import type { ProductSummary } from "@/lib/catalog";
import { formatIls, priceIls } from "@/domain/pricing";
import { isAvailabilityFresh } from "@/domain/reports";

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" });

/** A supplier product's own URL. It redirects to its family, with that variant selected. */
export function productHref(supplierCode: string, handle: string) {
  return `/catalog/${supplierCode}/${encodeURIComponent(handle)}`;
}

/** A family's page. `variant` (a SKU or variant id) selects one of its variants. */
export function familyHref(slug: string, variant?: string | null) {
  const path = `/catalog/p/${encodeURIComponent(slug)}`;
  return variant ? `${path}?v=${encodeURIComponent(variant)}` : path;
}

/** Suppliers only tell us yes or no, so this never shows a stock count. */
export function Availability({ available, checkedAt }: { available: boolean | null; checkedAt: Date }) {
  const date = dayMonth.format(checkedAt);
  if (available === null || !isAvailabilityFresh(checkedAt, new Date())) {
    return <span className="text-caption text-muted">זמינות לא אומתה</span>;
  }
  return available ? (
    <span className="text-caption text-success">זמין אצל הספק (נבדק {date})</span>
  ) : (
    <span className="text-caption text-warning">לא זמין כרגע (נבדק {date})</span>
  );
}

export function PriceRange({ min, max }: { min: string | null; max: string | null }) {
  const low = priceIls(min);
  const high = priceIls(max);
  if (low === null) return <span className="text-sm text-muted">המחיר ייבדק בהצעה</span>;
  return (
    <span className="font-semibold">
      {high !== null && high !== low && <span className="text-xs font-normal text-muted">החל מ-</span>}
      {formatIls(low)}
    </span>
  );
}

/** Some supplier originals are 6000px wide, and Shopify's CDN can resize on request. */
function sized(src: string, width: number) {
  if (!src.startsWith("https://cdn.shopify.com/")) return src;
  return `${src}${src.includes("?") ? "&" : "?"}width=${width}`;
}

type ProductImageProps = { src: string | undefined; alt: string; width: number; className?: string };

export function ProductImage({ src, alt, width, className }: ProductImageProps) {
  if (!src) return <div className={`bg-tile ${className}`} aria-hidden />;
  return (
    // Supplier photos are shot on white, so a multiply blend sits them on the light tile.
    <div className={`overflow-hidden bg-tile ${className}`}>
      {/* Hot-linked from the supplier's CDN, as agreed in the plan, so next/image is not used. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sized(src, width)}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="size-full object-contain mix-blend-multiply"
      />
    </div>
  );
}

/** Names the product photo so it morphs from the card into the product page. */
export function productImageTransition(productId: string) {
  return `product-image-${productId}`;
}

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <li>
      <Link
        href={familyHref(product.slug)}
        className="group flex h-full flex-col gap-3 rounded-card p-1 transition-transform duration-200 ease-out hover:-translate-y-0.5"
      >
        <ViewTransition name={productImageTransition(product.id)} share="morph" default="none">
          <ProductImage
            src={product.images[0]}
            alt={product.title}
            width={400}
            className="aspect-square w-full rounded-card p-4 transition-shadow duration-200 group-hover:shadow-lift"
          />
        </ViewTransition>
        <div className="flex flex-1 flex-col gap-1 px-1">
          <span className="ltr text-caption text-muted">{product.supplierNames.join(" · ")}</span>
          <h2 dir="ltr" className="line-clamp-2 flex-1 text-start text-[15px] font-medium tracking-normal">
            {product.title}
          </h2>
          <span className="flex items-baseline justify-between gap-2">
            <PriceRange min={product.minPriceUsd} max={product.maxPriceUsd} />
            {product.variantCount > 1 && (
              <span className="text-caption text-muted">{product.variantCount.toLocaleString("he-IL")} אפשרויות</span>
            )}
          </span>
          <Availability available={product.available} checkedAt={product.lastSeenAt} />
        </div>
      </Link>
    </li>
  );
}
