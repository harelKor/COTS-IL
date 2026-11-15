import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { categorizeShopify, programsFor, statusFor } from "./classify";
import type { FetchResult, NormalizedProduct, Program } from "./types";

export type { FetchResult };

const USER_AGENT = "COTS-IL-catalog-sync/1.0";
const PAGE_SIZE = 250;
const MAX_PAGES = 100;
const PAGE_DELAY_MS = 1500;
const MAX_ATTEMPTS = 5;

const variantSchema = z.object({
  id: z.number(),
  sku: z.string().nullish(),
  option1: z.string().nullish(),
  option2: z.string().nullish(),
  option3: z.string().nullish(),
  /** "Falcon Spline / L3 6.12:1 / Colson Wheel / CANCoder / Yes": every option, even past option3. */
  title: z.string().nullish(),
  position: z.number().nullish(),
  grams: z.number().nullish(),
  price: z.string().nullish(),
  compare_at_price: z.string().nullish(),
  available: z.boolean().nullish(),
});

const productSchema = z.object({
  id: z.number(),
  handle: z.string().min(1),
  title: z.string().min(1),
  body_html: z.string().nullish(),
  product_type: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  options: z.array(z.object({ name: z.string() })).nullish(),
  images: z.array(z.object({ src: z.string() })).nullish(),
  updated_at: z.string().nullish(),
  variants: z.array(variantSchema),
});

export type ShopifyProduct = z.infer<typeof productSchema>;

/** Supplier HTML ends up in our pages, so only plain formatting and safe links survive. */
export function sanitizeDescription(html: string | null | undefined): string | null {
  if (!html) return null;
  const clean = sanitizeHtml(html, {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "h2", "h3", "h4", "table", "thead", "tbody", "tr", "th", "td", "a"],
    allowedAttributes: { a: ["href", "rel", "target"] },
    allowedSchemes: ["https"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
      h1: "h2",
    },
  }).trim();
  return clean === "" ? null : clean;
}

/**
 * A variant's options by name. Shopify's JSON gives three values (option1-3), but a
 * product can have more options (AndyMark's swerve modules have five: … / Steering
 * Encoder / Assembled), which only the variant title holds. When the title splits into
 * one value per option name and agrees with option1-3, the title's values are used.
 */
function variantOptions(v: z.infer<typeof variantSchema>, optionNames: string[]) {
  const slots = [v.option1, v.option2, v.option3];
  const parts = v.title?.split(" / ").map((t) => t.trim()) ?? [];
  const values =
    optionNames.length > 3 && parts.length === optionNames.length && slots.every((s, n) => !s || s === parts[n]) ? parts : slots;
  return values.flatMap((value, n) => (value && value !== "Default Title" ? [{ name: optionNames[n] ?? "", value }] : []));
}

function positivePrice(price: string | null | undefined): string | null {
  return price && Number(price) > 0 ? price : null;
}

export function normalizeProduct(raw: ShopifyProduct, baseUrl: string, supplierPrograms: Program[]): NormalizedProduct {
  const tags = (Array.isArray(raw.tags) ? raw.tags : (raw.tags ?? "").split(","))
    .map((t) => t.trim())
    .filter(Boolean);
  const productType = raw.product_type?.trim() || null;
  const input = { title: raw.title, productType, tags };
  const optionNames = raw.options?.map((o) => o.name) ?? [];

  const variants = raw.variants.map((v, i) => ({
    supplierVariantId: String(v.id),
    supplierSku: v.sku?.trim() || null,
    options: variantOptions(v, optionNames),
    position: v.position ?? i + 1,
    grams: v.grams ?? null,
    priceUsd: positivePrice(v.price),
    compareAtUsd: positivePrice(v.compare_at_price),
    available: v.available ?? null,
  }));

  return {
    supplierProductId: String(raw.id),
    handle: raw.handle,
    title: raw.title.trim(),
    descriptionHtml: sanitizeDescription(raw.body_html),
    url: `${baseUrl}/products/${encodeURIComponent(raw.handle)}`,
    images: (raw.images ?? [])
      .map((i) => i.src)
      .filter((src) => src.startsWith("https://"))
      .slice(0, 8),
    productType,
    tags,
    programs: programsFor(input, supplierPrograms),
    categorySlug: categorizeShopify(input),
    sourceUpdatedAt: raw.updated_at ?? null,
    status: statusFor(input, variants.some((v) => v.priceUsd !== null)),
    variants,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetches one page, backing off when the store rate-limits us or has a temporary failure. */
async function fetchPage(url: string): Promise<unknown[]> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
    if (response.ok) {
      const body = (await response.json()) as { products?: unknown };
      if (!Array.isArray(body.products)) throw new Error(`Unexpected response from ${url}`);
      return body.products;
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) throw new Error(`HTTP ${response.status} from ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 2000);
  }
}

/** Reads the whole catalog. Throws on a failed page, so a partial catalog is never treated as complete. */
export async function fetchShopifyCatalog(baseUrl: string, programs: Program[]): Promise<FetchResult> {
  // Keyed by id because a product can show up on two pages if the store changes during the read.
  const products = new Map<number, NormalizedProduct>();
  let skipped = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS);
    const rows = await fetchPage(`${baseUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`);
    if (rows.length === 0) return { products: [...products.values()], skipped };
    for (const row of rows) {
      const parsed = productSchema.safeParse(row);
      if (parsed.success) products.set(parsed.data.id, normalizeProduct(parsed.data, baseUrl, programs));
      else skipped++;
    }
    // A short page is the last one: skip the extra request, which small stores often answer with 429.
    if (rows.length < PAGE_SIZE) return { products: [...products.values()], skipped };
  }
  throw new Error(`${baseUrl} has more than ${MAX_PAGES} pages`);
}
