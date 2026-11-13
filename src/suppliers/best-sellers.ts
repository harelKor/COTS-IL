import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { bestSellerHandles } from "../domain/popular";

type Db = PostgresJsDatabase<typeof schema>;

const USER_AGENT = "COTS-IL-catalog-sync/1.0";
/** Fewer handles than this and the page was probably not the product grid: the old ranks stay. */
const MIN_HANDLES = 5;
const PAGE_DELAY_MS = 3000;
/** Longest wait for a store's "retry-after" before giving up for today. */
const MAX_RETRY_WAIT_S = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchHtml(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" } });
    if (response.ok) return response.text();
    const retryAfter = Number(response.headers.get("retry-after"));
    if (response.status !== 429 || attempt === 2 || !(retryAfter > 0) || retryAfter > MAX_RETRY_WAIT_S) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    await sleep(retryAfter * 1000);
  }
  throw new Error(`no response from ${url}`);
}

/**
 * The store's best sellers, best first, from its "all products" collection sorted by
 * best selling (Shopify's own sales ranking; the JSON API ignores the sort, the page doesn't).
 */
export async function fetchBestSellers(baseUrl: string): Promise<string[]> {
  const best = await fetchHtml(`${baseUrl}/collections/all?sort_by=best-selling`);
  await sleep(PAGE_DELAY_MS);
  const byTitle = await fetchHtml(`${baseUrl}/collections/all?sort_by=title-ascending`);
  return bestSellerHandles(best, byTitle);
}

/**
 * Writes each product's position (1 = best) for one supplier; products not on the list get null.
 * A list too short to be the product grid changes nothing. Returns how many products were ranked.
 */
export async function saveBestSellerRanks(db: Db, supplierId: string, handles: string[]): Promise<number> {
  if (handles.length < MIN_HANDLES) return 0;
  const { products } = schema;
  return db.transaction(async (tx) => {
    await tx.update(products).set({ bestSellerRank: null }).where(eq(products.supplierId, supplierId));
    const rows = await tx
      .select({ id: products.id, handle: products.handle })
      .from(products)
      .where(and(eq(products.supplierId, supplierId), inArray(products.handle, handles)));
    const position = new Map(handles.map((h, i) => [h, i + 1]));
    for (const r of rows) {
      await tx
        .update(products)
        .set({ bestSellerRank: sql`${position.get(r.handle.toLowerCase()) ?? null}` })
        .where(eq(products.id, r.id));
    }
    return rows.length;
  });
}
