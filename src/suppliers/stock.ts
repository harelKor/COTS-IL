import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { parseCtreSection, parseWcpSection, type StockReading } from "../domain/backorder";

type Db = PostgresJsDatabase<typeof schema>;
type Supplier = typeof schema.suppliers.$inferSelect;

/**
 * Backorder ("ships later") check, run by the daily sync after a supplier's catalog
 * is written. Shopify's JSON can't tell backorder from in stock, so this reads the
 * product's own section HTML (~30–70 KB, not the 2 MB page) for the stores whose
 * theme exposes it. AndyMark and The Thrifty Bot don't (see docs/IMPROVEMENT-PLAN.md).
 */
const PARSERS: Record<string, (html: string) => StockReading> = {
  wcp: parseWcpSection,
  ctre: parseCtreSection,
};

const USER_AGENT = "COTS-IL-catalog-sync/1.0";
/** Gentle: one request at a time with a pause, and backing off on 429. */
const DELAY_MS = 1200;
const MAX_ATTEMPTS = 4;
/** Pages per supplier per run. The rest wait for the next day; unchanged products are skipped anyway. */
export const DEFAULT_BUDGET = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    if (response.ok) return response.text();
    if (response.status === 404) return null;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) throw new Error(`HTTP ${response.status} from ${url}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 5000);
  }
}

/** The theme's main product section id, read once from one full product page. */
async function mainSectionId(baseUrl: string, handle: string): Promise<string> {
  const html = await fetchText(`${baseUrl}/products/${encodeURIComponent(handle)}`);
  const id = html?.match(/(?:name="section-id" value|data-section-id)="(template--\d+__main)"/)?.[1];
  if (!id) throw new Error(`No product section id on ${baseUrl}`);
  return id;
}

export function hasStockCheck(code: string): boolean {
  return code in PARSERS;
}

/**
 * Checks the products that changed since their last check (or were never checked),
 * then those already shipping later, most expensive first, within `budget` pages.
 */
export async function checkShipsLater(db: Db, supplier: Supplier, budget = DEFAULT_BUDGET) {
  const parse = PARSERS[supplier.code];
  if (!parse) return { checked: 0, shipsLater: 0 };
  const p = schema.products;

  const due = await db
    .select({ id: p.id, handle: p.handle })
    .from(p)
    .where(
      and(
        eq(p.supplierId, supplier.id),
        // The admin's custom parts (S16c) have no page at the store.
        eq(p.source, "synced"),
        isNull(p.missingSince),
        eq(p.available, true),
        or(
          isNull(p.stockCheckedAt),
          sql`${p.sourceUpdatedAt} > ${p.stockCheckedAt}`,
          sql`EXISTS (SELECT 1 FROM ${schema.variants} v WHERE v.product_id = ${p.id} AND v.ships_later)`,
        ),
      ),
    )
    .orderBy(sql`${p.stockCheckedAt} IS NULL DESC`, desc(p.maxPriceUsd), asc(p.stockCheckedAt))
    .limit(budget);
  if (due.length === 0) return { checked: 0, shipsLater: 0 };

  const section = await mainSectionId(supplier.baseUrl, due[0].handle);
  let checked = 0;
  let later = 0;
  for (const product of due) {
    await sleep(DELAY_MS);
    let html: string | null;
    try {
      html = await fetchText(`${supplier.baseUrl}/products/${encodeURIComponent(product.handle)}?section_id=${section}`);
    } catch (error) {
      // Still limited after backing off: stop here and keep what was read; the rest waits for tomorrow.
      console.warn(`${supplier.code} stock check stopped after ${checked}: ${error instanceof Error ? error.message : error}`);
      break;
    }
    const now = new Date();
    if (html) {
      const reading = parse(html);
      const ids = [...reading.shipsLater.keys()];
      const laterIds = ids.filter((id) => reading.shipsLater.get(id));
      if (ids.length > 0) {
        const v = schema.variants;
        await db
          .update(v)
          .set({ shipsLater: false, shipsLaterEta: null })
          .where(and(eq(v.productId, product.id), v.shipsLater));
        if (laterIds.length > 0) {
          await db
            .update(v)
            .set({ shipsLater: true, shipsLaterEta: reading.eta })
            .where(and(eq(v.supplierId, supplier.id), inArray(v.supplierVariantId, laterIds)));
          later++;
        }
      }
    }
    await db.update(p).set({ stockCheckedAt: now }).where(eq(p.id, product.id));
    checked++;
  }
  return { checked, shipsLater: later };
}
