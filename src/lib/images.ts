/**
 * Supplier photos are hot-linked from their CDN (some originals are 6000px wide).
 * Shopify's CDN resizes on request, so every photo asks for the width it's shown
 * at, plus double for sharp screens. BigCommerce (goBILDA, REV) resizes through the
 * size segment of its stencil URL; the stored URL asks for 1280x1280, so it's
 * rewritten here and nothing in the database changes. Other hosts get the original.
 */
const SHOPIFY = "https://cdn.shopify.com/";
// https://cdn11.bigcommerce.com/s-<store>/images/stencil/<size>/products/…, size = 1280x1280, original, 480w …
const BIGCOMMERCE = /^(https:\/\/cdn\d*\.bigcommerce\.com\/s-[a-z0-9]+\/images\/stencil\/)(?:\d+x\d+|\d+w|original)(\/)/i;

export function sized(src: string, width: number): string {
  if (src.startsWith(SHOPIFY)) return `${src}${src.includes("?") ? "&" : "?"}width=${width}`;
  // `{W}w` keeps the photo's own proportions, like Shopify's width parameter.
  if (BIGCOMMERCE.test(src)) return src.replace(BIGCOMMERCE, `$1${Math.round(width)}w$2`);
  return src;
}

/** `src` and `srcSet` for an <img> shown `width` CSS pixels wide. */
export function shopifyImage(src: string, width: number): { src: string; srcSet: string | undefined } {
  if (!src.startsWith(SHOPIFY) && !BIGCOMMERCE.test(src)) return { src, srcSet: undefined };
  return { src: sized(src, width), srcSet: `${sized(src, width)} 1x, ${sized(src, width * 2)} 2x` };
}

/** Loading hints: the first photos on screen load at once and first, the rest when scrolled to. */
export function imageLoading(eager: boolean) {
  return eager ? ({ loading: "eager", fetchPriority: "high" } as const) : ({ loading: "lazy", fetchPriority: "auto" } as const);
}

/** How many catalog cards load their photo eagerly: the first row or two on any screen. */
export const EAGER_CARDS = 6;

/**
 * The lightbox's photo: as large as the CDN has it, capped at 2400px (some originals are 6000px).
 * Shopify never enlarges, so a 650px original comes back at 650px.
 */
export function largestImage(src: string): string {
  return sized(src, 2400);
}
