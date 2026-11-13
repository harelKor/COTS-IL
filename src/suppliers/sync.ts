import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { regroupCatalog } from "./families";
import { fetchBoiUsdRate, type UsdRate } from "./boi";
import type { FetchResult, NormalizedProduct } from "./types";

type Db = PostgresJsDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Supplier = typeof schema.suppliers.$inferSelect;

const BATCH_SIZE = 200;
/** A catalog this much smaller than last time is more likely a store problem than real deletions. */
const MIN_CATALOG_RATIO = 0.5;

function chunks<T>(items: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

const excluded = (column: string) => sql.raw(`excluded.${column}`);

function summarize(product: NormalizedProduct) {
  const prices = product.variants.flatMap((v) => (v.priceUsd ? [Number(v.priceUsd)] : []));
  const availability = product.variants.map((v) => v.available);
  return {
    minPriceUsd: prices.length ? Math.min(...prices).toFixed(2) : null,
    maxPriceUsd: prices.length ? Math.max(...prices).toFixed(2) : null,
    available: availability.every((a) => a === null) ? null : availability.some((a) => a === true),
  };
}

function searchText(product: NormalizedProduct, supplierName: string) {
  return [
    product.title,
    supplierName,
    product.productType,
    ...product.tags,
    ...product.variants.flatMap((v) => [v.supplierSku, ...v.options.map((o) => o.value)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Database errors carry the whole query and its values, so keep only the reason. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? error.cause.message : error.message;
}

/** The latest stored USD→ILS rate, or null when none has ever been stored. */
export async function latestUsdRate(db: Db): Promise<UsdRate | null> {
  const [row] = await db
    .select()
    .from(schema.exchangeRates)
    .where(eq(schema.exchangeRates.currency, "USD"))
    .orderBy(desc(schema.exchangeRates.rateDate))
    .limit(1);
  return row ? { rate: Number(row.rate), rateDate: row.rateDate } : null;
}

/**
 * Fetches today's Bank of Israel rate and stores it. If the fetch fails, the last
 * stored rate stays in force; with no rate at all, the sync must not run.
 */
export async function refreshUsdRate(db: Db, fetchRate: () => Promise<UsdRate> = fetchBoiUsdRate) {
  try {
    const fresh = await fetchRate();
    await db
      .insert(schema.exchangeRates)
      .values({ currency: "USD", rateDate: fresh.rateDate, rate: String(fresh.rate) })
      .onConflictDoUpdate({
        target: [schema.exchangeRates.currency, schema.exchangeRates.rateDate],
        set: { rate: String(fresh.rate), fetchedAt: new Date() },
      });
    return { ...fresh, fetched: true as const };
  } catch (error) {
    const last = await latestUsdRate(db);
    if (!last) throw new Error(`No USD→ILS rate stored and the fetch failed: ${describeError(error)}`);
    return { ...last, fetched: false as const, error: describeError(error) };
  }
}

/**
 * Writes a supplier's catalog in one transaction. If fetching fails or the result
 * looks wrong, the job is marked failed and the existing catalog stays as it was.
 */
export async function syncSupplier(
  db: Db,
  supplier: Supplier,
  fetchCatalog: () => Promise<FetchResult>,
  usdIlsRate?: number,
  /** "refresh" writes only the products read and marks nothing missing (BigCommerce's daily pass). */
  mode: "full" | "refresh" = "full",
) {
  const [job] = await db
    .insert(schema.syncJobs)
    .values({ supplierId: supplier.id, usdIlsRate: usdIlsRate === undefined ? null : String(usdIlsRate) })
    .returning();

  try {
    const { products, skipped, unread = [], stats = {} } = await fetchCatalog();
    // Families can span suppliers, so the whole catalog is regrouped with the new data.
    const counts = await db.transaction(async (tx) => {
      const written = mode === "full" ? await writeCatalog(tx, supplier, products, unread) : await refreshCatalog(tx, supplier, products);
      const grouped = await regroupCatalog(tx);
      return { ...written, families: grouped.families };
    });
    const summary = { ...stats, ...counts, mode, skipped };
    await db
      .update(schema.syncJobs)
      .set({ status: "succeeded", finishedAt: new Date(), counts: summary })
      .where(eq(schema.syncJobs.id, job.id));
    return summary;
  } catch (error) {
    await db
      .update(schema.syncJobs)
      .set({ status: "failed", finishedAt: new Date(), error: describeError(error) })
      .where(eq(schema.syncJobs.id, job.id));
    throw error;
  }
}

async function writeCatalog(tx: Tx, supplier: Supplier, products: NormalizedProduct[], unread: string[] = []) {
  const now = new Date();

  const [{ known }] = await tx
    .select({ known: sql<number>`count(*)::int` })
    .from(schema.products)
    .where(and(eq(schema.products.supplierId, supplier.id), eq(schema.products.source, "synced"), isNull(schema.products.missingSince)));
  if (products.length < known * MIN_CATALOG_RATIO) {
    throw new Error(`Got ${products.length} products but ${known} are known. Not applying this sync.`);
  }

  const { variantCount, priceChanges } = await upsertProducts(tx, supplier, products, now);

  // Products whose page kept failing this time stay as they were (BigCommerce); the rest not seen are gone.
  const unreadUrls = unread.length > 0 ? sql`AND url NOT IN (${sql.join(unread.map((u) => sql`${u}`), sql`, `)})` : sql``;
  const missingProducts = await tx
    .update(schema.products)
    .set({ missingSince: now })
    .where(
      and(
        eq(schema.products.supplierId, supplier.id),
        // The admin's custom parts (S16c) are never in the store's feed.
        eq(schema.products.source, "synced"),
        lt(schema.products.lastSeenAt, now),
        isNull(schema.products.missingSince),
        sql`true ${unreadUrls}`,
      ),
    )
    .returning({ id: schema.products.id });

  const missingVariants = await tx
    .update(schema.variants)
    .set({ missingSince: now })
    .where(
      and(
        eq(schema.variants.supplierId, supplier.id),
        sql`${schema.variants.productId} IN (SELECT id FROM products WHERE source = 'synced' ${unreadUrls})`,
        lt(schema.variants.checkedAt, now),
        isNull(schema.variants.missingSince),
      ),
    )
    .returning({ id: schema.variants.id });

  return {
    products: products.length,
    variants: variantCount,
    priceChanges,
    missingProducts: missingProducts.length,
    missingVariants: missingVariants.length,
  };
}

/** A partial read (BigCommerce's daily refresh): updates what was read and marks nothing missing. */
async function refreshCatalog(tx: Tx, supplier: Supplier, products: NormalizedProduct[]) {
  const { variantCount, priceChanges } = await upsertProducts(tx, supplier, products, new Date());
  return { products: products.length, variants: variantCount, priceChanges, missingProducts: 0, missingVariants: 0 };
}

/** Writes products and variants and records changed prices; marks nothing missing. */
async function upsertProducts(tx: Tx, supplier: Supplier, products: NormalizedProduct[], now: Date) {
  const categories = await tx.select().from(schema.categories);
  const categoryIds = new Map(categories.map((c) => [c.slug, c.id]));

  const previous = await tx
    .select({
      supplierVariantId: schema.variants.supplierVariantId,
      priceUsd: schema.variants.priceUsd,
      compareAtUsd: schema.variants.compareAtUsd,
      available: schema.variants.available,
    })
    .from(schema.variants)
    .where(eq(schema.variants.supplierId, supplier.id));
  const previousByKey = new Map(previous.map((v) => [v.supplierVariantId, v]));

  let variantCount = 0;
  let priceChanges = 0;

  for (const batch of chunks(products)) {
    const saved = await tx
      .insert(schema.products)
      .values(
        batch.map((p) => ({
          supplierId: supplier.id,
          supplierProductId: p.supplierProductId,
          handle: p.handle,
          title: p.title,
          descriptionHtml: p.descriptionHtml,
          url: p.url,
          images: p.images,
          // The store's own values; each regroup lays product_overrides over them (S16c).
          storeTitle: p.title,
          storeDescriptionHtml: p.descriptionHtml,
          storeImages: p.images,
          productType: p.productType,
          tags: p.tags,
          programs: p.programs,
          categoryId: categoryIds.get(p.categorySlug) ?? null,
          status: p.status,
          searchText: searchText(p, supplier.name),
          lastSeenAt: now,
          missingSince: null,
          sourceUpdatedAt: p.sourceUpdatedAt ? new Date(p.sourceUpdatedAt) : null,
          ...summarize(p),
        })),
      )
      .onConflictDoUpdate({
        target: [schema.products.supplierId, schema.products.supplierProductId],
        set: {
          handle: excluded("handle"),
          title: excluded("title"),
          descriptionHtml: excluded("description_html"),
          url: excluded("url"),
          images: excluded("images"),
          storeTitle: excluded("store_title"),
          storeDescriptionHtml: excluded("store_description_html"),
          storeImages: excluded("store_images"),
          productType: excluded("product_type"),
          tags: excluded("tags"),
          programs: excluded("programs"),
          categoryId: excluded("category_id"),
          status: excluded("status"),
          minPriceUsd: excluded("min_price_usd"),
          maxPriceUsd: excluded("max_price_usd"),
          available: excluded("available"),
          searchText: excluded("search_text"),
          lastSeenAt: excluded("last_seen_at"),
          missingSince: excluded("missing_since"),
          sourceUpdatedAt: excluded("source_updated_at"),
        },
      })
      .returning({ id: schema.products.id, supplierProductId: schema.products.supplierProductId });
    const productIds = new Map(saved.map((p) => [p.supplierProductId, p.id]));

    const variantRows = batch.flatMap((p) =>
      p.variants.map((v) => ({
        supplierId: supplier.id,
        productId: productIds.get(p.supplierProductId)!,
        ...v,
        supplierPriceUsd: v.priceUsd,
        storeSku: v.supplierSku,
        storeOptions: v.options,
        storeAvailable: v.available,
        checkedAt: now,
        missingSince: null,
      })),
    );
    // Some stores list the same variant twice, and one upsert can't touch a row twice.
    const uniqueRows = [...new Map(variantRows.map((row) => [row.supplierVariantId, row])).values()];

    for (const rows of chunks(uniqueRows)) {
      const savedVariants = await tx
        .insert(schema.variants)
        .values(rows)
        .onConflictDoUpdate({
          target: [schema.variants.supplierId, schema.variants.supplierVariantId],
          set: {
            productId: excluded("product_id"),
            supplierSku: excluded("supplier_sku"),
            options: excluded("options"),
            position: excluded("position"),
            grams: excluded("grams"),
            // The admin's price wins (S15), so the history doesn't flip back and forth each night.
            priceUsd: sql`coalesce((SELECT o.price_usd FROM variant_overrides o WHERE o.variant_id = ${schema.variants.id}), excluded.price_usd)`,
            supplierPriceUsd: excluded("supplier_price_usd"),
            compareAtUsd: excluded("compare_at_usd"),
            // The admin's availability wins too, for the same reason; SKU and options are laid over by the regroup.
            available: sql`coalesce((SELECT o.available FROM product_overrides o WHERE o.product_id = excluded.product_id), excluded.available)`,
            storeSku: excluded("store_sku"),
            storeOptions: excluded("store_options"),
            storeAvailable: excluded("store_available"),
            checkedAt: excluded("checked_at"),
            missingSince: excluded("missing_since"),
            // BigCommerce pages say backorder themselves; Shopify's comes from the stock check (stock.ts), so it's left alone.
            ...(supplier.platform === "bigcommerce" ? { shipsLater: excluded("ships_later"), shipsLaterEta: excluded("ships_later_eta") } : {}),
          },
        })
        .returning({
          id: schema.variants.id,
          supplierVariantId: schema.variants.supplierVariantId,
          priceUsd: schema.variants.priceUsd,
          compareAtUsd: schema.variants.compareAtUsd,
          available: schema.variants.available,
        });

      const changed = savedVariants.filter((v) => {
        const before = previousByKey.get(v.supplierVariantId);
        return (
          !before ||
          before.priceUsd !== v.priceUsd ||
          before.compareAtUsd !== v.compareAtUsd ||
          before.available !== v.available
        );
      });
      if (changed.length > 0) {
        await tx.insert(schema.priceHistory).values(
          changed.map((v) => ({
            variantId: v.id,
            priceUsd: v.priceUsd,
            compareAtUsd: v.compareAtUsd,
            available: v.available,
            observedAt: now,
          })),
        );
      }
      variantCount += rows.length;
      priceChanges += changed.length;
    }
  }

  return { variantCount, priceChanges };
}

/**
 * The pages a BigCommerce supplier's daily refresh reads: its parts in team carts, in open
 * orders, pinned by the admin (מומלץ), and its 24 most-ordered parts of the last year.
 * Everything else waits for the weekly full pass.
 */
export async function refreshTargets(db: Db, supplierId: string, limit = 400): Promise<string[]> {
  const rows = await db.execute<{ url: string }>(sql`
    SELECT p.url FROM products p
    WHERE p.supplier_id = ${supplierId} AND p.source = 'synced' AND p.missing_since IS NULL AND (
      p.id IN (SELECT v.product_id FROM variants v JOIN cart_items c ON c.variant_id = v.id)
      OR p.id IN (
        SELECT v.product_id FROM variants v
        JOIN team_order_items i ON i.variant_id = v.id
        JOIN team_orders o ON o.id = i.order_id
        WHERE o.status IN ('submitted', 'quote_sent', 'approved') AND o.submitted_at > now() - interval '120 days')
      OR p.id IN (SELECT product_id FROM product_overrides WHERE pin_rank IS NOT NULL)
      OR p.id IN (
        SELECT v.product_id FROM variants v
        JOIN team_order_items i ON i.variant_id = v.id
        JOIN team_orders o ON o.id = i.order_id
        WHERE o.submitted_at > now() - interval '12 months' AND o.status <> 'cancelled'
        GROUP BY v.product_id ORDER BY count(DISTINCT o.team_id) DESC, sum(i.qty) DESC LIMIT 24)
    )
    ORDER BY p.url
    LIMIT ${limit}`);
  return rows.map((r) => r.url);
}

/** How many synced products a supplier has now; a BigCommerce supplier with none gets a full pass. */
export async function knownProducts(db: Db, supplierId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.products)
    .where(and(eq(schema.products.supplierId, supplierId), eq(schema.products.source, "synced"), isNull(schema.products.missingSince)));
  return n;
}
