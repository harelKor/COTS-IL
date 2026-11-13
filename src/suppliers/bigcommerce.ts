import {
  optionCombinations,
  optionLabel,
  parseProductPage,
  parseSitemap,
  parseVariantAnswer,
  type BcProductPage,
  type BcVariantAnswer,
} from "../domain/bigcommerce";
import { assessRun, emptyStats, type PageRunStats } from "../domain/sync-health";
import { categorizeByTitleFirst, programsFor, statusFor } from "./classify";
import { DisallowedError, PoliteClient, RateLimitedError } from "./http";
import { sanitizeDescription } from "./shopify";
import type { FetchResult, NormalizedProduct, NormalizedVariant, Program } from "./types";

/**
 * BigCommerce stores (goBILDA, REV): no public feed, so the sync reads the product sitemap
 * and then each product page, one request a second (docs/admin-guide.md). Parsing is in
 * src/domain/bigcommerce.ts. A REV product with options needs one more request per option:
 * the store's own "option picked" call, which gives that variant's SKU, price and stock.
 */

const MAX_SITEMAP_PAGES = 20;

/** A REV option combination as the store answered it. */
export type ResolvedVariant = { labels: { name: string; value: string }[]; answer: BcVariantAnswer };

function handleOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/^\/+|\/+$/g, "") || url;
  } catch {
    return url;
  }
}

/** Store availability → our yes/no plus "ships later" (בהזמנה מראש). */
function stock(page: BcProductPage): { available: boolean | null; shipsLater: boolean; shipsLaterEta: string | null } {
  switch (page.availability) {
    case "in_stock":
      return { available: true, shipsLater: false, shipsLaterEta: null };
    case "backorder":
    case "preorder":
      return { available: true, shipsLater: true, shipsLaterEta: page.eta };
    case "out_of_stock":
    case "discontinued":
      return { available: false, shipsLater: false, shipsLaterEta: null };
    default:
      return { available: page.purchasable, shipsLater: false, shipsLaterEta: null };
  }
}

/**
 * One store page in our shape. Variant keys never change for the same item:
 * `p<product id>` for something bought as a product (a goBILDA size, a REV single part),
 * `v<variant id>` for a REV option.
 */
export function normalizeBcProduct(page: BcProductPage, resolved: ResolvedVariant[] | null, supplierPrograms: Program[]): NormalizedProduct {
  const tags = [...page.breadcrumbs];
  if (page.availability === "discontinued") tags.push("discontinued");
  const productType = page.breadcrumbs.at(-1) ?? null;
  const input = { title: page.title, productType, tags };
  const base = stock(page);
  let needsReview = false;

  let variants: NormalizedVariant[];
  if (page.children.length > 0) {
    variants = page.children.map((child, i) => ({
      supplierVariantId: `p${child.productId}`,
      supplierSku: child.sku,
      options: [{ name: "Option", value: child.label }],
      position: i + 1,
      grams: null,
      priceUsd: child.priceUsd,
      compareAtUsd: null,
      available: page.availability === "discontinued" ? false : child.available,
      shipsLater: child.shipsLater,
      shipsLaterEta: null,
    }));
  } else if (page.options.length > 0 && resolved && resolved.length > 0) {
    variants = resolved.map((r, i) => ({
      supplierVariantId: r.answer.variantId ? `v${r.answer.variantId}` : `p${page.productId}-${i + 1}`,
      supplierSku: r.answer.sku,
      options: r.labels.map((l) => ({ name: l.name, value: optionLabel(l.value, r.answer.sku) })),
      position: i + 1,
      grams: page.grams,
      priceUsd: r.answer.priceUsd,
      compareAtUsd: null,
      available: page.availability === "discontinued" ? false : r.answer.available,
      // The option answer has no backorder flag; the page's applies to all of them.
      shipsLater: base.shipsLater && r.answer.available !== false,
      shipsLaterEta: base.shipsLater ? base.shipsLaterEta : null,
    }));
  } else {
    // A plain product, or one whose options couldn't be read: its own price, left for the admin to check.
    needsReview = page.options.length > 0 || page.isParent;
    variants = [
      {
        supplierVariantId: `p${page.productId}`,
        supplierSku: page.sku,
        options: [],
        position: 1,
        grams: page.grams,
        priceUsd: page.priceRange?.min ?? page.priceUsd,
        compareAtUsd: null,
        ...base,
      },
    ];
  }

  // A store can answer two combinations with the same variant (an option that changes nothing).
  variants = [...new Map(variants.map((v) => [v.supplierVariantId, v])).values()];
  const hasPrice = variants.some((v) => v.priceUsd !== null);
  const status = statusFor(input, hasPrice);
  return {
    supplierProductId: page.productId,
    handle: handleOf(page.url),
    title: page.title,
    descriptionHtml: sanitizeDescription(page.descriptionHtml),
    url: page.url,
    images: page.images,
    productType,
    tags,
    programs: programsFor(input, supplierPrograms),
    categorySlug: categorizeByTitleFirst(input),
    sourceUpdatedAt: null,
    status: needsReview && status === "published" ? "review" : status,
    variants,
  };
}

export type BcFetchOptions = {
  /** Read only these product pages (the daily refresh); otherwise the whole sitemap. */
  urls?: string[];
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

/** Asks the store for each combination of a product's options. Null when there are too many to ask. */
async function resolveOptions(client: PoliteClient, baseUrl: string, page: BcProductPage, stats: PageRunStats): Promise<ResolvedVariant[] | null> {
  const combos = optionCombinations(page.options);
  if (!combos) return null;
  const names = new Map(page.options.map((o) => [o.attributeId, o.name]));
  const resolved: ResolvedVariant[] = [];
  for (const combo of combos) {
    const form = new URLSearchParams({ action: "add", product_id: page.productId });
    for (const pick of combo) form.append(`attribute[${pick.attributeId}]`, pick.value.id);
    form.append("qty[]", "1");
    stats.variantCalls++;
    let answer: BcVariantAnswer | null = null;
    try {
      const res = await client.postForm(`${baseUrl}/remote/v1/product-attributes/${page.productId}`, form);
      if (res.status === 200) answer = parseVariantAnswer(JSON.parse(res.body));
    } catch (error) {
      if (error instanceof RateLimitedError || error instanceof DisallowedError) throw error;
      answer = null;
    }
    if (!answer) {
      stats.variantFailures++;
      continue;
    }
    // A combination the store doesn't sell (no SKU, can't be bought) isn't a variant.
    if (!answer.sku && answer.purchasable === false) continue;
    resolved.push({ labels: combo.map((c) => ({ name: names.get(c.attributeId) ?? "Option", value: c.value.label })), answer });
  }
  return resolved;
}

function sameUrl(url: string): string {
  return url.replace(/[?#].*$/, "").replace(/\/?$/, "/").toLowerCase();
}

/**
 * Reads a BigCommerce store. A full run reads the sitemap and every product; a refresh
 * reads the given pages only. Throws (so nothing is written) when the run can't be
 * trusted: robots.txt says no, the store rate-limits us, or too few pages could be read.
 */
export async function fetchBigCommerceCatalog(baseUrl: string, programs: Program[], opts: BcFetchOptions = {}): Promise<FetchResult> {
  const log = opts.log ?? (() => {});
  const client = new PoliteClient(baseUrl, opts.minIntervalMs ?? 1000, opts.fetchImpl, opts.wait);
  const stats = emptyStats(opts.urls ? "refresh" : "full");
  await client.loadRobots();

  let queue: string[];
  if (opts.urls) {
    queue = [...opts.urls];
  } else {
    queue = [];
    for (let page = 1; page <= MAX_SITEMAP_PAGES; page++) {
      const res = await client.get(`${baseUrl}/xmlsitemap.php?type=products&page=${page}`);
      if (res.status !== 200) {
        if (page === 1) throw new Error(`HTTP ${res.status} from the product sitemap`);
        break;
      }
      const urls = parseSitemap(res.body).filter((u) => !queue.includes(u));
      if (urls.length === 0) break;
      queue.push(...urls);
    }
    stats.sitemapUrls = queue.length;
    if (queue.length === 0) throw new Error("The product sitemap listed no products (did the store move it?)");
  }

  const seenUrls = new Set(queue.map(sameUrl));
  // Pages reached by following a stub: goBILDA's "rd-…" stubs lead to category pages, which aren't products.
  const fromStub = new Set<string>();
  const products = new Map<string, NormalizedProduct>();
  const unread: string[] = [];
  const started = Date.now();

  for (let i = 0; i < queue.length; i++) {
    const url = queue[i];
    if (i > 0 && i % 200 === 0) log(`${i}/${queue.length} pages, ${products.size} products, ${Math.round((Date.now() - started) / 60000)} min`);
    stats.pages++;
    let res;
    try {
      res = await client.get(url);
    } catch (error) {
      if (error instanceof RateLimitedError || error instanceof DisallowedError) throw error;
      stats.unread++;
      unread.push(url);
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      stats.gone++;
      continue;
    }
    if (res.status !== 200) {
      stats.unread++;
      unread.push(url);
      continue;
    }
    const page = parseProductPage(res.body, url);
    if (page.kind === "stub") {
      stats.stubs++;
      const target = page.target.replace(/[?#].*$/, "");
      if (target.startsWith(baseUrl) && !seenUrls.has(sameUrl(target))) {
        seenUrls.add(sameUrl(target));
        fromStub.add(target);
        queue.push(target);
      }
      continue;
    }
    if (page.kind === "empty") {
      if (fromStub.has(url)) stats.landing++;
      continue;
    }
    if (products.has(page.productId)) {
      stats.parsed++;
      continue;
    }
    if (page.isParent) {
      stats.parents++;
      if (page.children.length === 0) stats.parentsWithoutChildren++;
    }
    const resolved = page.children.length === 0 && page.options.length > 0 ? await resolveOptions(client, baseUrl, page, stats) : null;
    const product = normalizeBcProduct(page, resolved, programs);
    if (product.variants.every((v) => v.priceUsd === null)) stats.noPrice++;
    else stats.parsed++;
    if (product.images.length === 0) stats.noImage++;
    if (product.variants.every((v) => v.available === null)) stats.unknownStock++;
    products.set(page.productId, product);
  }

  const verdict = assessRun(stats);
  if (!verdict.ok) throw new Error(verdict.reason);
  for (const w of verdict.warnings) log(`warning: ${w}`);
  log(`${client.requests} requests in ${Math.round((Date.now() - started) / 1000)} s`);
  return { products: [...products.values()], skipped: stats.pages - stats.parsed - stats.stubs, unread, stats: { ...stats, requests: client.requests, warnings: verdict.warnings } };
}
