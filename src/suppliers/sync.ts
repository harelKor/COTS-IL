import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import type { FetchResult } from "./shopify";
import type { NormalizedProduct } from "./types";

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

/**
 * Writes a supplier's catalog in one transaction. If fetching fails or the result
 * looks wrong, the job is marked failed and the existing catalog stays as it was.
 */
export async function syncSupplier(db: Db, supplier: Supplier, fetchCatalog: () => Promise<FetchResult>) {
  const [job] = await db.insert(schema.syncJobs).values({ supplierId: supplier.id }).returning();

  try {
    const { products, skipped } = await fetchCatalog();
    const counts = await db.transaction((tx) => writeCatalog(tx, supplier, products));
    const summary = { ...counts, skipped };
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

async function writeCatalog(tx: Tx, supplier: Supplier, products: NormalizedProduct[]) {
  const now = new Date();

  const [{ known }] = await tx
    .select({ known: sql<number>`count(*)::int` })
    .from(schema.products)
    .where(and(eq(schema.products.supplierId, supplier.id), isNull(schema.products.missingSince)));
  if (products.length < known * MIN_CATALOG_RATIO) {
    throw new Error(`Got ${products.length} products but ${known} are known. Not applying this sync.`);
  }

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
          productType: p.productType,
          tags: p.tags,
          programs: p.programs,
          categoryId: categoryIds.get(p.categorySlug) ?? null,
          status: p.status,
          searchText: searchText(p, supplier.name),
          lastSeenAt: now,
          missingSince: null,
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
        },
      })
      .returning({ id: schema.products.id, supplierProductId: schema.products.supplierProductId });
    const productIds = new Map(saved.map((p) => [p.supplierProductId, p.id]));

    const variantRows = batch.flatMap((p) =>
      p.variants.map((v) => ({
        supplierId: supplier.id,
        productId: productIds.get(p.supplierProductId)!,
        ...v,
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
            priceUsd: excluded("price_usd"),
            compareAtUsd: excluded("compare_at_usd"),
            available: excluded("available"),
            checkedAt: excluded("checked_at"),
            missingSince: excluded("missing_since"),
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

  const missingProducts = await tx
    .update(schema.products)
    .set({ missingSince: now })
    .where(
      and(
        eq(schema.products.supplierId, supplier.id),
        lt(schema.products.lastSeenAt, now),
        isNull(schema.products.missingSince),
      ),
    )
    .returning({ id: schema.products.id });

  const missingVariants = await tx
    .update(schema.variants)
    .set({ missingSince: now })
    .where(
      and(
        eq(schema.variants.supplierId, supplier.id),
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
