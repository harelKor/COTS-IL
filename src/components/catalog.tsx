import { shopifyImage } from "@/lib/images";

export { familyHref, productHref, productImageTransition } from "@/lib/catalog-links";
export { sized } from "@/lib/images";

type ProductImageProps = { src: string | undefined; alt: string; width: number; className?: string };

export function ProductImage({ src, alt, width, className }: ProductImageProps) {
  if (!src) return <div className={`bg-tile ${className}`} aria-hidden />;
  return (
    // Supplier photos are shot on white, so a multiply blend sits them on the light tile.
    <div className={`overflow-hidden bg-tile ${className}`}>
      {/* Hot-linked from the supplier's CDN, as agreed in the plan, so next/image is not used. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...shopifyImage(src, width)}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="size-full object-contain mix-blend-multiply"
      />
    </div>
  );
}
