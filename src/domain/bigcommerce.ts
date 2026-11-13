/**
 * BigCommerce (Stencil) stores have no public product feed, so the sync reads each
 * product page (src/suppliers/bigcommerce.ts). These functions read what came back:
 * the product sitemap, a product page and the store's option-price answer. They are
 * pure and tested with saved pages from goBILDA and REV (__fixtures__/bigcommerce).
 *
 * What a page gives us:
 * - JSON-LD `Product` (name, sku, price, availability, image) and `BreadcrumbList`;
 * - `BCData.product_attributes` (sku, price or price range, instock, which option values are variants);
 * - `<input name="product_id">`, the store's own product id;
 * - goBILDA only: `stencilBootstrap("product", …)` with the whole product (availability text such
 *   as "Discontinued", the description HTML, photos, a replacement SKU), and its "parent" pages,
 *   which list every child product (a size or pack) with SKU, price and stock.
 */

export type BcAvailability = "in_stock" | "out_of_stock" | "backorder" | "preorder" | "discontinued" | "unknown";

export type BcOptionValue = { id: string; label: string };
/** A choice that picks a variant (size, length). Add-on products and text fields are not options here. */
export type BcOption = { attributeId: string; name: string; values: BcOptionValue[] };

/** goBILDA: one row of a parent page's list, itself a product in the store. */
export type BcChild = { productId: string; sku: string; label: string; priceUsd: string | null; available: boolean | null; shipsLater: boolean };

export type BcProductPage = {
  kind: "product";
  productId: string;
  url: string;
  title: string;
  sku: string | null;
  /** HTML from the store's own data when it has it, else the JSON-LD text turned into paragraphs. */
  descriptionHtml: string | null;
  images: string[];
  /** Breadcrumb names between "Home" and the product itself. */
  breadcrumbs: string[];
  priceUsd: string | null;
  priceRange: { min: string; max: string } | null;
  availability: BcAvailability;
  /** The store's words for when a backorder or pre-order ships, if any. */
  eta: string | null;
  purchasable: boolean | null;
  grams: number | null;
  options: BcOption[];
  children: BcChild[];
  /** goBILDA marks a parent page with a "parent-…" SKU; a parent with no children means the page changed. */
  isParent: boolean;
  replacementSku: string | null;
};

/** goBILDA's old one-SKU pages now redirect to the parent page that lists them. */
export type BcStubPage = { kind: "stub"; target: string };
/** A page with no product data: a layout change, an error page, a landing page. */
export type BcEmptyPage = { kind: "empty" };
export type BcPage = BcProductPage | BcStubPage | BcEmptyPage;

/** What the store answers when an option is picked (`POST /remote/v1/product-attributes/<id>`). */
export type BcVariantAnswer = { variantId: string | null; sku: string | null; priceUsd: string | null; available: boolean | null; purchasable: boolean | null; image: string | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", ndash: "–", mdash: "—", reg: "®", trade: "™", deg: "°", times: "×", frac12: "½", frac14: "¼", frac34: "¾" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const key = e.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
    return m;
  });
}

/** Visible text of a bit of HTML, on one line. */
function text(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** Product URLs from `/xmlsitemap.php?type=products&page=N`. */
export function parseSitemap(xml: string): string[] {
  return [...new Set([...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodeEntities(m[1])))];
}

/** Reads the JSON object that starts at `start` (an opening brace), minding strings. */
export function readJsonObject(source: string, start: number): unknown {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(source.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

function jsonLd(html: string): Json[] {
  const found: Json[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(m[1]);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        const o = obj(item);
        if (!o) continue;
        const graph = o["@graph"];
        if (Array.isArray(graph)) found.push(...graph.map(obj).filter((g): g is Json => !!g));
        else found.push(o);
      }
    } catch {
      // A broken block is skipped; the rest of the page may still have what we need.
    }
  }
  return found;
}

function ofType(items: Json[], type: string): Json | null {
  return items.find((i) => (Array.isArray(i["@type"]) ? i["@type"].includes(type) : i["@type"] === type)) ?? null;
}

function bcData(html: string): Json | null {
  const at = html.search(/BCData\s*=\s*\{/);
  if (at < 0) return null;
  return obj(obj(readJsonObject(html, html.indexOf("{", at)))?.product_attributes);
}

/** goBILDA's `stencilBootstrap("product", "<JSON in a JS string>")`. */
function stencilProduct(html: string): Json | null {
  const marker = 'stencilBootstrap("product", "';
  const at = html.indexOf(marker);
  if (at < 0) return null;
  let i = at + marker.length;
  let literal = "";
  while (i < html.length && html[i] !== '"') {
    if (html[i] === "\\") {
      literal += html.slice(i, i + 2);
      i += 2;
    } else literal += html[i++];
  }
  try {
    return obj(obj(JSON.parse(JSON.parse(`"${literal.replace(/\\x([0-9a-f]{2})/gi, "\\u00$1").replace(/\\'/g, "'")}"`)))?.product);
  } catch {
    return null;
  }
}

function availabilityFromSchema(value: unknown): BcAvailability {
  const v = String(value ?? "").toLowerCase();
  if (v.endsWith("instock") || v.endsWith("limitedavailability") || v.endsWith("onlineonly") || v.endsWith("instoreonly")) return "in_stock";
  if (v.endsWith("backorder")) return "backorder";
  if (v.endsWith("preorder") || v.endsWith("presale")) return "preorder";
  if (v.endsWith("discontinued")) return "discontinued";
  if (v.endsWith("outofstock") || v.endsWith("soldout")) return "out_of_stock";
  return "unknown";
}

/** "Usually ships in 2-3 weeks", "Expected to ship late November" and the like, from the store's own messages. */
function etaFrom(...messages: unknown[]): string | null {
  for (const m of messages) {
    const t = typeof m === "string" ? text(m) : "";
    if (t && t.length <= 120 && /ship|expect|avail|arriv|eta|week|month|january|february|march|april|may|june|july|august|september|october|november|december/i.test(t)) return t;
  }
  return null;
}

const GRAMS_PER: Record<string, number> = { ounce: 28.3495, ounces: 28.3495, oz: 28.3495, pound: 453.592, pounds: 453.592, lbs: 453.592, lb: 453.592, gram: 1, grams: 1, g: 1, kilogram: 1000, kilograms: 1000, kg: 1000 };

function grams(weight: unknown): number | null {
  const w = obj(weight);
  const formatted = typeof weight === "string" ? weight : typeof w?.formatted === "string" ? w.formatted : null;
  const m = formatted?.match(/([\d.]+)\s*([a-z]+)/i);
  if (!m) return null;
  const per = GRAMS_PER[m[2].toLowerCase()];
  const n = Number(m[1]);
  return per && n > 0 ? Math.round(n * per) : null;
}

/** Every photo of this product on the page, by the store's image id, at one size. */
function productImages(html: string, productId: string, fallback: (string | null)[]): string[] {
  const byId = new Map<string, string>();
  const re = new RegExp(`(https://[a-z0-9.-]+/s-[a-z0-9]+/images/stencil/)(?:[^/"'\\s]+)(/products/${productId}/(\\d+)/[^"'\\s?&]+)(\\?c=\\d+)?`, "gi");
  for (const m of html.replaceAll("\\/", "/").matchAll(re)) {
    if (!byId.has(m[3])) byId.set(m[3], `${m[1]}1280x1280${m[2]}${m[4] ?? ""}`);
  }
  const images = [...byId.values()];
  for (const f of fallback) if (f && f.startsWith("https://") && images.length === 0) images.push(f);
  return images.slice(0, 8);
}

/** Plain JSON-LD text ("line\n\nline") as safe paragraphs; the sync sanitizes it again. */
function paragraphs(plain: string | null): string | null {
  if (!plain) return null;
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = decodeEntities(plain)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.length ? blocks.map((b) => `<p>${escape(b).replace(/\n/g, "<br>")}</p>`).join("") : null;
}

const VARIANT_FIELDS = new Set(["set-radio", "set-select", "set-rectangle", "swatch"]);

/**
 * The option fields that pick a variant. A store also uses radios for add-ons ("product-list")
 * and price modifiers; BCData lists which value ids are variant values, so only those count.
 */
export function parseOptions(html: string, variantValueIds: Set<string>): BcOption[] {
  const options: BcOption[] = [];
  const starts = [...html.matchAll(/<div[^>]*\bdata-product-attribute="([a-z-]+)"[^>]*>/gi)];
  for (const [n, m] of starts.entries()) {
    if (!VARIANT_FIELDS.has(m[1])) continue;
    const end = starts[n + 1]?.index ?? Math.min(html.length, m.index + 20000);
    const block = html.slice(m.index, end);
    const name = text(block.match(/<label[^>]*>([\s\S]*?)<\/label>/i)?.[1]?.replace(/<(small|span)[\s\S]*?<\/\1>/gi, "") ?? "").replace(/[:*\s]+$/, "");
    const attributeId = block.match(/name="attribute\[(\d+)\]"/)?.[1];
    if (!attributeId) continue;
    const values: BcOptionValue[] = [];
    for (const v of block.matchAll(/<label[^>]*data-product-attribute-value="(\d+)"[^>]*>([\s\S]*?)<\/label>/gi)) values.push({ id: v[1], label: text(v[2]) });
    if (values.length === 0) for (const v of block.matchAll(/<option[^>]*value="(\d+)"[^>]*>([\s\S]*?)<\/option>/gi)) values.push({ id: v[1], label: text(v[2]) });
    const unique = [...new Map(values.filter((v) => v.label).map((v) => [v.id, v])).values()];
    if (unique.length > 0 && unique.some((v) => variantValueIds.has(v.id))) options.push({ attributeId, name: name || "Option", values: unique });
  }
  return options;
}

/** goBILDA parent pages: the children listed in the main column (the sticky copy and cross-sells are skipped). */
export function parseChildren(html: string): BcChild[] {
  const children = new Map<string, BcChild>();
  const blocks = html.split(/<div class="card-body child">/).slice(1);
  for (const block of blocks) {
    const input = block.match(/<input\b[^>]*class="childProductOption"[^>]*>/)?.[0];
    if (!input || !/name="child-mainColumn"/.test(input)) continue;
    const productId = input.match(/data-pid="(\d+)"/)?.[1];
    const sku = input.match(/data-sku="([^"]+)"/)?.[1];
    if (!productId || !sku || children.has(productId)) continue;
    const body = block.split(/<\/label>/)[0];
    const label = text(body.match(/<h4[^>]*card-title[^>]*>([\s\S]*?)<\/h4>/)?.[1] ?? "") || sku;
    const price = money(text(body.match(/price--withoutTax[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ""));
    const message = text(body.match(/class="childMessage[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
    const shipsLater = /back-?order|pre-?order/i.test(message);
    const unavailable = !shipsLater && /out of stock|sold out|unavailable|discontinued|no longer/i.test(message);
    children.set(productId, { productId, sku: decodeEntities(sku), label, priceUsd: price, available: unavailable ? false : true, shipsLater });
  }
  return [...children.values()];
}

/** A product page, a redirect stub, or a page with no product data. */
export function parseProductPage(html: string, pageUrl: string): BcPage {
  const attributes = bcData(html);
  const refresh = html.match(/<meta[^>]*http-equiv="refresh"[^>]*content="\d+;\s*url=([^"]+)"/i)?.[1];
  if (refresh && !attributes) {
    try {
      return { kind: "stub", target: new URL(decodeEntities(refresh), pageUrl).toString() };
    } catch {
      return { kind: "empty" };
    }
  }

  const ld = jsonLd(html);
  const product = ofType(ld, "Product");
  const ctx = stencilProduct(html);
  const productId =
    html.match(/<input[^>]*name="product_id"[^>]*value="(\d+)"/)?.[1] ?? html.match(/<input[^>]*value="(\d+)"[^>]*name="product_id"/)?.[1] ?? str(ctx?.id);
  const heading = html.match(/<h1[^>]*productView-title[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)?.[1];
  const title = (str(product?.name) ? decodeEntities(String(product?.name)).trim() : null) ?? str(ctx?.title) ?? (heading ? text(heading) : null) ?? decodeEntities(ogTitle ?? "").trim();
  if (!productId || !title || (!product && !attributes)) return { kind: "empty" };

  const offers = product?.offers;
  const offer = obj(Array.isArray(offers) ? offers[0] : offers);
  const price = obj(attributes?.price);
  const range = obj(price?.price_range);
  const priceUsd = money(obj(price?.without_tax)?.value) ?? money(offer?.price) ?? money(offer?.lowPrice);
  const min = money(obj(obj(range?.min)?.without_tax)?.value) ?? money(offer?.lowPrice);
  const max = money(obj(obj(range?.max)?.without_tax)?.value) ?? money(offer?.highPrice);

  const crumbs = obj(ofType(ld, "BreadcrumbList"))?.itemListElement;
  const breadcrumbs = (Array.isArray(crumbs) ? crumbs : [])
    .map((c) => decodeEntities(str(obj(obj(c)?.item)?.name) ?? str(obj(c)?.name) ?? ""))
    .filter((name, i, all) => name && i > 0 && i < all.length - 1 && !/^home$/i.test(name));

  const ctxAvailability = String(ctx?.availability ?? "").trim();
  let availability: BcAvailability = /discontinued|no longer available/i.test(ctxAvailability) ? "discontinued" : availabilityFromSchema(offer?.availability);
  if (availability === "unknown" && typeof attributes?.instock === "boolean") availability = attributes.instock ? "in_stock" : "out_of_stock";
  // REV files what it no longer makes under "Discontinued & Discounted Products"; sold out there means gone.
  if (availability === "out_of_stock" && breadcrumbs.some((b) => /discontinued/i.test(b))) availability = "discontinued";
  if (availability === "in_stock" && (ctx?.pre_order === true || /pre-?order/i.test(ctxAvailability))) availability = "preorder";
  if (availability === "in_stock" && ctx?.show_backorder_message === true) availability = "backorder";

  const sku = str(attributes?.sku) ?? (typeof product?.sku === "string" ? str(product.sku) : null) ?? str(ctx?.sku);
  const customFields = Array.isArray(ctx?.custom_fields) ? ctx.custom_fields.map(obj) : [];
  const replacementSku = str(customFields.find((f) => f?.name === "replacement_sku")?.value);

  const variantValues = Array.isArray(attributes?.available_variant_values) ? attributes.available_variant_values.map(String) : [];
  const image = product?.image;
  const isParent = /^parent-/i.test(sku ?? "");

  return {
    kind: "product",
    productId,
    // goBILDA's parent pages have no JSON-LD Product; their canonical address is the one to keep (the request may have been redirected).
    url:
      str(offer?.url) ??
      str(product?.url) ??
      html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]*property="og:url"[^>]*content="([^"]+)"/i)?.[1] ??
      pageUrl.replace(/[?#].*$/, ""),
    title,
    sku: isParent ? null : sku,
    descriptionHtml: (typeof ctx?.description === "string" && ctx.description.trim()) || paragraphs(str(product?.description)),
    images: productImages(html, productId, [...(Array.isArray(image) ? image.map(str) : [str(image)]), html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/)?.[1] ?? null]),
    breadcrumbs,
    priceUsd,
    priceRange: min && max && min !== max ? { min, max } : null,
    availability,
    eta: availability === "backorder" || availability === "preorder" ? etaFrom(ctx?.pre_order_message, ctx?.backorder_message, ctx?.default_shipping_expectation_prompt) : null,
    purchasable: typeof attributes?.purchasable === "boolean" ? attributes.purchasable : null,
    grams: grams(attributes?.weight ?? ctx?.weight),
    options: parseOptions(html, new Set(variantValues)),
    children: isParent ? parseChildren(html) : [],
    isParent,
    replacementSku,
  };
}

/** The store's answer for one picked combination of options. */
export function parseVariantAnswer(json: unknown): BcVariantAnswer | null {
  const data = obj(obj(json)?.data);
  if (!data) return null;
  const image = obj(data.image)?.data;
  return {
    variantId: str(data.variantId) ?? str(data.v3_variant_id),
    sku: str(data.sku),
    priceUsd: money(obj(obj(data.price)?.without_tax)?.value),
    available: typeof data.instock === "boolean" ? data.instock : null,
    purchasable: typeof data.purchasable === "boolean" ? data.purchasable : null,
    image: typeof image === "string" && image.startsWith("https://") ? image.replace("{:size}", "1280x1280") : null,
  };
}

/** "20 Tooth Metal #25 Sprocket (REV-41-1720)" → "20 Tooth Metal #25 Sprocket": the SKU has its own field. */
export function optionLabel(label: string, sku?: string | null): string {
  const trimmed = label.replace(/\s*\(\s*[A-Z0-9][A-Z0-9-]{3,}\s*\)\s*$/i, "").trim();
  if (sku && trimmed.toLowerCase() === sku.toLowerCase()) return label;
  return trimmed || label;
}

/** Every combination of option values, up to `cap`; null when there are more (then the product is left for review). */
export function optionCombinations(options: BcOption[], cap = 40): { attributeId: string; value: BcOptionValue }[][] | null {
  const total = options.reduce((n, o) => n * o.values.length, 1);
  if (options.length === 0 || total > cap) return options.length === 0 ? [] : null;
  let combos: { attributeId: string; value: BcOptionValue }[][] = [[]];
  for (const option of options) combos = combos.flatMap((c) => option.values.map((value) => [...c, { attributeId: option.attributeId, value }]));
  return combos;
}
