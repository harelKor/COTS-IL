export { familyHref, productHref, productImageTransition } from "@/lib/catalog-links";

/** Some supplier originals are 6000px wide, and Shopify's CDN can resize on request. */
export function sized(src: string, width: number) {
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
