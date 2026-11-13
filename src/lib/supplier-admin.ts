import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { draftSupplier, isPublicHost, normalizeStoreUrl, pageLooksBigCommerce, pageLooksShopify, parseStorePage, supplierRemoval, type SupplierDraft } from "@/domain/supplier-detect";

/**
 * The server side of /admin/settings/suppliers (S16b): reading a store for the
 * "add by URL" form, starting the GitHub sync for one supplier, and the cards' data.
 */

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML = 512 * 1024;
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; COTS-IL supplier check)", Accept: "text/html,application/json;q=0.9,*/*;q=0.5" };

/** GET with a timeout, following redirects only to public hosts. Null on any failure. */
async function fetchPublic(url: string): Promise<{ url: string; body: string; type: string } | null> {
  let current = url;
  let throttled = 0;
  for (let hop = 0; hop < 4; hop++) {
    try {
      const res = await fetch(current, { headers: HEADERS, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
      // Shopify answers bursts with 429 now and then; a short wait usually gets a 200.
      if (res.status === 429 && throttled < 3) {
        throttled++;
        hop--;
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return null;
        const target = new URL(next, current);
        if (!isPublicHost(target.hostname) || !/^https?:$/.test(target.protocol)) return null;
        current = target.toString();
        continue;
      }
      if (!res.ok) return null;
      const body = (await res.text()).slice(0, MAX_HTML);
      return { url: current, body, type: res.headers.get("content-type") ?? "" };
    } catch {
      return null;
    }
  }
  return null;
}

/** Reads the store's home page and probes /products.json (or a BigCommerce product sitemap). Null when the URL isn't a public store address. */
export async function detectStore(input: string): Promise<SupplierDraft | null> {
  const start = normalizeStoreUrl(input);
  if (!start) return null;
  const page = await fetchPublic(start);
  // A store often redirects to www or https; its products live at the address it settles on.
  const baseUrl = page ? (normalizeStoreUrl(page.url) ?? start) : start;
  const probe = await fetchPublic(`${baseUrl}/products.json?limit=5`);
  let productsJson: unknown = null;
  if (probe && probe.type.includes("json")) {
    try {
      productsJson = JSON.parse(probe.body);
    } catch {
      productsJson = null;
    }
  }
  // The first logo candidate that really is an image (a page can point at a favicon it doesn't have).
  let logoUrl: string | null = null;
  for (const candidate of page ? parseStorePage(page.body, baseUrl).logoCandidates.slice(0, 4) : []) {
    const img = await fetchPublic(candidate);
    if (img?.type.startsWith("image/")) {
      logoUrl = img.url;
      break;
    }
  }
  // BigCommerce has no feed; its product sitemap says how many products the sync will read.
  let sitemapXml: string | null = null;
  if (productsJson === null && page && !pageLooksShopify(page.body) && pageLooksBigCommerce(page.body)) {
    const sitemap = await fetchPublic(`${baseUrl}/xmlsitemap.php?type=products&page=1`);
    sitemapXml = sitemap?.body ?? null;
  }
  const taken = (await db.select({ code: schema.suppliers.code }).from(schema.suppliers)).map((s) => s.code);
  return draftSupplier({ baseUrl, html: page?.body ?? null, productsJson, takenCodes: taken, logoUrl, sitemapXml });
}

/** Where "סנכרון עכשיו" sends its request; `GITHUB_REPOSITORY` overrides the repo. */
const REPO = process.env.GITHUB_REPOSITORY || "harelKor/COTS-IL";

/** Why the sync button is off, or null when it works. */
export function syncUnavailableReason(): string | null {
  return process.env.GITHUB_TOKEN ? null : "חסר GITHUB_TOKEN בהגדרות Vercel (ראו המדריך למנהל). בינתיים הסנכרון רץ כל לילה.";
}

/** Runs .github/workflows/sync.yml for one supplier (workflow_dispatch). */
export async function dispatchSync(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: syncUnavailableReason()! };
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/sync.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { supplier: code } }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 204) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, error: "GitHub דחה את המפתח (GITHUB_TOKEN). צריך הרשאת Actions: Read and write." };
    return { ok: false, error: `GitHub החזיר ${res.status}` };
  } catch {
    return { ok: false, error: "אין חיבור ל-GitHub כרגע" };
  }
}

export type SyncJobView = { status: "running" | "succeeded" | "failed"; startedAt: string; finishedAt: string | null; error: string | null; products: number | null };

/** The supplier's latest sync job. */
export async function latestSyncJob(supplierId: string): Promise<SyncJobView | null> {
  const [job] = await db.select().from(schema.syncJobs).where(eq(schema.syncJobs.supplierId, supplierId)).orderBy(desc(schema.syncJobs.startedAt)).limit(1);
  if (!job) return null;
  const counts = job.counts as { products?: number } | null;
  return {
    status: job.status,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    error: job.error,
    products: typeof counts?.products === "number" ? counts.products : null,
  };
}

/** How many order lines and supplier orders point at the supplier's parts, and so whether it can be deleted. */
export async function supplierReferences(supplierId: string) {
  const {
    rows: [r],
  } = await db.execute<{ order_lines: number; supplier_orders: number }>(sql`
    SELECT (SELECT count(*)::int FROM team_order_items i JOIN variants v ON v.id = i.variant_id WHERE v.supplier_id = ${supplierId}) AS order_lines,
           (SELECT count(*)::int FROM supplier_pos WHERE supplier_id = ${supplierId})
         + (SELECT count(*)::int FROM po_lines l JOIN variants v ON v.id = l.variant_id WHERE v.supplier_id = ${supplierId}) AS supplier_orders`);
  const refs = { orderLines: r.order_lines, supplierOrders: r.supplier_orders };
  return { ...refs, removal: supplierRemoval(refs) };
}

export type SupplierCardData = {
  id: string;
  code: string;
  name: string;
  baseUrl: string;
  platform: "shopify" | "bigcommerce" | "csv" | "manual";
  programs: ("FRC" | "FTC")[];
  active: boolean;
  logoUrl: string | null;
  accentColor: string | null;
  accentColor2: string | null;
  freeShippingUsd: string | null;
  notes: string | null;
  syncEnabled: boolean;
  products: number;
  canDelete: boolean;
  lastJob: SyncJobView | null;
};

/** Every supplier for the cards, hidden ones last. */
export async function supplierCards(): Promise<SupplierCardData[]> {
  const { rows } = await db.execute<{
    id: string;
    code: string;
    name: string;
    base_url: string;
    platform: SupplierCardData["platform"];
    programs: string;
    active: boolean;
    logo_url: string | null;
    accent_color: string | null;
    accent_color_2: string | null;
    free_shipping_usd: string | null;
    notes: string | null;
    sync_enabled: boolean;
    products: number;
    refs: number;
    job_status: SyncJobView["status"] | null;
    job_started: Date | null;
    job_finished: Date | null;
    job_error: string | null;
    job_counts: { products?: number } | null;
  }>(sql`
    SELECT s.id, s.code, s.name, s.base_url, s.platform, s.programs::text AS programs, s.active, s.logo_url, s.accent_color, s.accent_color_2, s.free_shipping_usd, s.notes, s.sync_enabled,
           (SELECT count(*)::int FROM products p WHERE p.supplier_id = s.id AND p.missing_since IS NULL) AS products,
           (SELECT count(*)::int FROM supplier_pos po WHERE po.supplier_id = s.id)
         + (SELECT count(*)::int FROM team_order_items i JOIN variants v ON v.id = i.variant_id WHERE v.supplier_id = s.id)
         + (SELECT count(*)::int FROM po_lines l JOIN variants v ON v.id = l.variant_id WHERE v.supplier_id = s.id) AS refs,
           j.status AS job_status, j.started_at AS job_started, j.finished_at AS job_finished, j.error AS job_error, j.counts AS job_counts
      FROM suppliers s
      LEFT JOIN LATERAL (SELECT * FROM sync_jobs WHERE supplier_id = s.id ORDER BY started_at DESC LIMIT 1) j ON true
     ORDER BY s.active DESC, s.name`);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    baseUrl: r.base_url,
    platform: r.platform,
    programs: r.programs.replace(/[{}]/g, "").split(",").filter(Boolean) as ("FRC" | "FTC")[],
    active: r.active,
    logoUrl: r.logo_url,
    accentColor: r.accent_color,
    accentColor2: r.accent_color_2,
    freeShippingUsd: r.free_shipping_usd,
    notes: r.notes,
    syncEnabled: r.sync_enabled,
    products: r.products,
    canDelete: r.refs === 0,
    lastJob: r.job_status
      ? {
          status: r.job_status,
          startedAt: new Date(r.job_started!).toISOString(),
          finishedAt: r.job_finished ? new Date(r.job_finished).toISOString() : null,
          error: r.job_error,
          products: typeof r.job_counts?.products === "number" ? r.job_counts.products : null,
        }
      : null,
  }));
}
