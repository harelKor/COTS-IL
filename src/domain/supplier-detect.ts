/**
 * Adding a supplier by its store URL (S16b): the pure part. The server fetches the
 * store's home page and `/products.json`; these functions read what came back, so
 * they're tested with saved HTML and JSON. A store that answers `/products.json`
 * with a product list is Shopify and syncs nightly; anything else is a `manual`
 * supplier whose parts are added by hand (S16c).
 */

export type DetectedPlatform = "shopify" | "manual";
export type Program = "FRC" | "FTC";

export type SupplierDraft = {
  code: string;
  name: string;
  baseUrl: string;
  logoUrl: string | null;
  platform: DetectedPlatform;
  programs: Program[];
  /** For a Shopify store: how many products the first page of /products.json listed. */
  sampleProducts: number | null;
};

/** "wcproducts.com/collections/x" → "https://wcproducts.com"; null unless it's a public http(s) host. */
export function normalizeStoreUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!isPublicHost(host)) return null;
  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`;
}

/** Refuses local and private addresses, so the admin's fetch can't reach the server's own network. */
export function isPublicHost(host: string): boolean {
  if (!host.includes(".")) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host.startsWith("[")) return false;
  const ip = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ip) return true;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", ndash: "–", mdash: "—" };

function decode(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      const key = e.toLowerCase();
      if (ENTITIES[key]) return ENTITIES[key];
      if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Every tag of one name with its attributes, lowercased names. */
function tags(html: string, name: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  for (const m of html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([a-z_:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) attrs[a[1].toLowerCase()] = decode(a[3] ?? a[4] ?? a[5] ?? "");
    found.push(attrs);
  }
  return found;
}

function meta(html: string, key: string): string | null {
  const tag = tags(html, "meta").find((t) => (t.property ?? t.name ?? "").toLowerCase() === key);
  return tag?.content?.trim() || null;
}

function absolute(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href.startsWith("//") ? `https:${href}` : href, baseUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const GENERIC_PART = /^(home|home page|welcome|shop|store|online store|דף הבית)$/i;
const squash = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** "shop.reduxrobotics.com" → "reduxrobotics": the first host label that isn't www, shop or store. */
export function siteLabel(host: string): string {
  const labels = host.toLowerCase().split(".").filter(Boolean);
  return labels.find((l, i) => i < labels.length - 1 && !/^(www\d*|shop|store|m)$/.test(l)) ?? labels[0] ?? "";
}

/**
 * The part of a <title> that names the store: "Home – West Coast Products" → "West Coast Products";
 * "Redux Robotics | Industrial Grade Electronics" on reduxrobotics.com → "Redux Robotics". The part
 * that matches the host wins, otherwise the first part that isn't "Home".
 */
export function storeNameFromTitle(title: string, host = ""): string {
  const parts = title
    .split(/\s+[|–—-]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const named = parts.filter((p) => !GENERIC_PART.test(p));
  const hostKey = squash(siteLabel(host));
  const matching = hostKey.length >= 3 ? named.find((p) => squash(p).length >= 3 && (hostKey.includes(squash(p)) || squash(p).includes(hostKey))) : undefined;
  return (matching ?? named[0] ?? parts[0] ?? title).trim();
}

/**
 * The store's name and logo from its home page: og:site_name, then <title>; og:image, then the touch
 * icon, then the favicon. `logoCandidates` keeps that order so the server can use the first that loads.
 */
export function parseStorePage(html: string, baseUrl: string): { name: string | null; logoUrl: string | null; logoCandidates: string[] } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const name = meta(html, "og:site_name") ?? (title ? storeNameFromTitle(decode(title), new URL(baseUrl).hostname) : null);

  const links = tags(html, "link").filter((l) => l.href);
  const rel = (r: string) => links.find((l) => (l.rel ?? "").toLowerCase().split(/\s+/).includes(r))?.href;
  const candidates = [meta(html, "og:image"), meta(html, "og:image:secure_url"), rel("apple-touch-icon"), rel("apple-touch-icon-precomposed"), rel("icon"), rel("shortcut")];
  const logoCandidates = [...new Set(candidates.map((c) => (c ? absolute(c, baseUrl) : null)).filter((c): c is string => !!c))];
  return { name: name ? name.slice(0, 80) : null, logoUrl: logoCandidates[0] ?? null, logoCandidates };
}

/** A Shopify store answers /products.json with `{ products: [...] }`. Returns how many, or null for anything else. */
export function shopifyProductCount(json: unknown): number | null {
  if (!json || typeof json !== "object" || !("products" in json)) return null;
  const products = (json as { products: unknown }).products;
  if (!Array.isArray(products)) return null;
  // Real Shopify ids are numbers; a look-alike feed with text ids ("canandmag") can't be synced.
  const looksRight = products.every((p) => p && typeof p === "object" && typeof (p as { id?: unknown }).id === "number" && "handle" in p && Array.isArray((p as { variants?: unknown }).variants));
  return looksRight ? products.length : null;
}

/** A Shopify theme loads its files from cdn.shopify.com and sets window.Shopify; used when /products.json is throttled (429). */
export function pageLooksShopify(html: string): boolean {
  return /cdn\.shopify\.com|window\.Shopify\b|Shopify\.shop\s*=|shopify-section/.test(html);
}

/** A short lowercase code that isn't taken: "West Coast Products" → "westcoastproducts", "rev" → "rev2" if "rev" exists. */
export function suggestCode(name: string | null, host: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((c) => c.toLowerCase()));
  const fromHost = siteLabel(host);
  const fromName = (name ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
  let base = (fromName.length >= 2 && fromName.length <= 16 ? fromName : fromHost.toLowerCase().replace(/[^a-z0-9]+/g, "")).slice(0, 16);
  if (base.length < 2) base = "supplier";
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

/** Which programs a store serves, from its own words; FRC when it says neither. */
export function guessPrograms(html: string): Program[] {
  const text = html.replace(/<[^>]+>/g, " ");
  const ftc = /\bFTC\b|FIRST Tech Challenge/i.test(text);
  const frc = /\bFRC\b|FIRST Robotics Competition/i.test(text);
  if (ftc && !frc) return ["FTC"];
  if (ftc && frc) return ["FRC", "FTC"];
  return ["FRC"];
}

/** Puts the fetched page and the /products.json probe together into the form's starting values. */
export function draftSupplier(input: { baseUrl: string; html: string | null; productsJson: unknown; takenCodes: Iterable<string>; logoUrl?: string | null }): SupplierDraft {
  const host = new URL(input.baseUrl).hostname;
  const parsed = input.html ? parseStorePage(input.html, input.baseUrl) : { name: null, logoUrl: null };
  // The server passes the first logo that really loaded (null when none did).
  const page = { name: parsed.name, logoUrl: input.logoUrl !== undefined ? input.logoUrl : parsed.logoUrl };
  const count = shopifyProductCount(input.productsJson);
  const name = page.name ?? host.replace(/^(www\d*|shop|store)\./, "");
  return {
    code: suggestCode(page.name, host, input.takenCodes),
    name,
    baseUrl: input.baseUrl,
    logoUrl: page.logoUrl,
    platform: count !== null || (input.html !== null && pageLooksShopify(input.html)) ? "shopify" : "manual",
    programs: input.html ? guessPrograms(input.html) : ["FRC"],
    sampleProducts: count,
  };
}

/** Delete is only allowed when no team order line or supplier order points at the supplier's parts; otherwise hide. */
export function supplierRemoval(refs: { orderLines: number; supplierOrders: number }): "delete" | "hide-only" {
  return refs.orderLines === 0 && refs.supplierOrders === 0 ? "delete" : "hide-only";
}

/** Supplier codes go into URLs, the sync's command line and the workflow input. */
export const SUPPLIER_CODE = /^[a-z0-9][a-z0-9-]{1,23}$/;
