import Link from "next/link";
import type { ProductSummary } from "@/lib/catalog";
import { formatIls, priceIls } from "@/domain/pricing";
import { isAvailabilityFresh } from "@/domain/reports";

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" });

export function productHref(supplierCode: string, handle: string) {
  return `/catalog/${supplierCode}/${encodeURIComponent(handle)}`;
}

/** Suppliers only tell us yes or no, so this never shows a stock count. */
export function Availability({ available, checkedAt }: { available: boolean | null; checkedAt: Date }) {
  const date = dayMonth.format(checkedAt);
  if (available === null || !isAvailabilityFresh(checkedAt, new Date())) {
    return <span className="text-xs text-muted">זמינות לא אומתה</span>;
  }
  return available ? (
    <span className="text-xs text-success">זמין אצל הספק (נבדק {date})</span>
  ) : (
    <span className="text-xs text-warning">לא זמין כרגע (נבדק {date})</span>
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
  if (!src) return <div className={`bg-subtle ${className}`} aria-hidden />;
  return (
    // Hot-linked from the supplier's CDN, as agreed in the plan, so next/image is not used.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sized(src, width)}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`bg-white object-contain ${className}`}
    />
  );
}

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <li>
      <Link
        href={productHref(product.supplierCode, product.handle)}
        className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface hover:border-brand"
      >
        <ProductImage src={product.images[0]} alt="" width={400} className="aspect-square w-full" />
        <div className="flex flex-1 flex-col gap-1 p-3">
          <span className="ltr text-xs text-muted">{product.supplierName}</span>
          <h2 dir="ltr" className="line-clamp-2 flex-1 text-start text-sm font-medium">
            {product.title}
          </h2>
          <PriceRange min={product.minPriceUsd} max={product.maxPriceUsd} />
          <Availability available={product.available} checkedAt={product.lastSeenAt} />
        </div>
      </Link>
    </li>
  );
}
