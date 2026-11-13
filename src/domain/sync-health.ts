/**
 * A page-reading sync (BigCommerce) is only as good as its reading of the store's pages.
 * When a store redesigns, pages still load but no longer yield products; this decides,
 * before anything is written, whether a run read enough to be trusted. A run that fails
 * here changes nothing, and "מערכת" shows the reason.
 */

export type PageRunStats = {
  mode: "full" | "refresh";
  /** Product URLs listed by the sitemap (full runs). */
  sitemapUrls: number;
  /** Pages requested, stubs included. */
  pages: number;
  /** Redirect stubs (goBILDA's old one-SKU pages). */
  stubs: number;
  /** Pages a stub led to that aren't products (goBILDA's "see also" stubs point at category pages). */
  landing: number;
  /** Pages that yielded a product with an id, a name and a price. */
  parsed: number;
  /** Product pages with no price at all. */
  noPrice: number;
  noImage: number;
  /** Products whose stock couldn't be read. */
  unknownStock: number;
  /** goBILDA "parent-…" pages, and those that listed no children. */
  parents: number;
  parentsWithoutChildren: number;
  variantCalls: number;
  variantFailures: number;
  /** Pages that kept failing after retries; their products are left as they were. */
  unread: number;
  /** Pages that answered 404 or 410. */
  gone: number;
};

export function emptyStats(mode: PageRunStats["mode"]): PageRunStats {
  return { mode, sitemapUrls: 0, pages: 0, stubs: 0, landing: 0, parsed: 0, noPrice: 0, noImage: 0, unknownStock: 0, parents: 0, parentsWithoutChildren: 0, variantCalls: 0, variantFailures: 0, unread: 0, gone: 0 };
}

export const MIN_PARSED_SHARE = 0.8;
export const MAX_UNREAD_SHARE = 0.02;
export const MAX_VARIANT_FAILURE_SHARE = 0.3;
export const MAX_EMPTY_PARENT_SHARE = 0.2;
/** Above this share of products without a price or stock, the run succeeds with a warning. */
export const WARN_SHARE = 0.05;

export type RunVerdict = { ok: true; warnings: string[] } | { ok: false; reason: string };

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function assessRun(s: PageRunStats): RunVerdict {
  if (s.mode === "full" && s.sitemapUrls === 0) return { ok: false, reason: "The product sitemap listed no products (did the store move it?)" };
  const productPages = s.pages - s.stubs - s.landing - s.gone - s.unread;
  if (s.unread > 0 && s.unread / Math.max(1, s.pages) > MAX_UNREAD_SHARE) {
    return { ok: false, reason: `${s.unread} of ${s.pages} pages kept failing; not applying a partial catalog` };
  }
  if (productPages > 0 && s.parsed / productPages < MIN_PARSED_SHARE) {
    return { ok: false, reason: `Only ${s.parsed} of ${productPages} pages had product data (did the page layout change?)` };
  }
  if (s.mode === "full" && productPages === 0) return { ok: false, reason: "No product page could be read" };
  if (s.variantCalls >= 5 && s.variantFailures / s.variantCalls > MAX_VARIANT_FAILURE_SHARE) {
    return { ok: false, reason: `${s.variantFailures} of ${s.variantCalls} option lookups failed (did the store change its option endpoint?)` };
  }
  if (s.parents >= 5 && s.parentsWithoutChildren / s.parents > MAX_EMPTY_PARENT_SHARE) {
    return { ok: false, reason: `${s.parentsWithoutChildren} of ${s.parents} parent pages listed no sizes (did the page layout change?)` };
  }
  const warnings: string[] = [];
  if (s.parsed > 0 && s.noPrice / s.parsed > WARN_SHARE) warnings.push(`${pct(s.noPrice / s.parsed)} without a price`);
  if (s.parsed > 0 && s.unknownStock / s.parsed > WARN_SHARE) warnings.push(`${pct(s.unknownStock / s.parsed)} without stock`);
  if (s.parsed > 0 && s.noImage / s.parsed > WARN_SHARE) warnings.push(`${pct(s.noImage / s.parsed)} without a photo`);
  return { ok: true, warnings };
}

/** Whether a finished job's counts deserve the admin's attention on "מערכת". */
export function needsAttention(counts: Partial<PageRunStats> | null | undefined): boolean {
  if (!counts || !counts.parsed) return false;
  return (counts.noPrice ?? 0) / counts.parsed > WARN_SHARE || (counts.unknownStock ?? 0) / counts.parsed > WARN_SHARE;
}
