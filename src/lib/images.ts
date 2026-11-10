/**
 * Supplier photos are hot-linked from their CDN (some originals are 6000px wide).
 * Shopify's CDN resizes on request, so every photo asks for the width it's shown
 * at, plus double for sharp screens. Other hosts get the original.
 */
export function sized(src: string, width: number): string {
  if (!src.startsWith("https://cdn.shopify.com/")) return src;
  return `${src}${src.includes("?") ? "&" : "?"}width=${width}`;
}

/** `src` and `srcSet` for an <img> shown `width` CSS pixels wide. */
export function shopifyImage(src: string, width: number): { src: string; srcSet: string | undefined } {
  if (!src.startsWith("https://cdn.shopify.com/")) return { src, srcSet: undefined };
  return { src: sized(src, width), srcSet: `${sized(src, width)} 1x, ${sized(src, width * 2)} 2x` };
}

/** Loading hints: the first photos on screen load at once and first, the rest when scrolled to. */
export function imageLoading(eager: boolean) {
  return eager ? ({ loading: "eager", fetchPriority: "high" } as const) : ({ loading: "lazy", fetchPriority: "auto" } as const);
}

/** How many catalog cards load their photo eagerly: the first row or two on any screen. */
export const EAGER_CARDS = 6;
