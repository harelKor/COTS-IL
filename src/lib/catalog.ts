import "server-only";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { PAGE_SIZE, searchPatterns, type CatalogFilters } from "./catalog-filters";

const { categories, products, suppliers, variants } = schema;

const visible = and(eq(products.status, "published"), isNull(products.missingSince), eq(suppliers.active, true));

export async function searchProducts(filters: CatalogFilters) {
  await connection();

  const conditions: (SQL | undefined)[] = [visible];
  for (const pattern of searchPatterns(filters.q)) {
    conditions.push(sql`${products.searchText} ILIKE ${pattern}`);
  }
  if (filters.category) conditions.push(eq(categories.slug, filters.category));
  if (filters.supplier) conditions.push(eq(suppliers.code, filters.supplier));
  if (filters.program) conditions.push(sql`${filters.program}::program = ANY(${products.programs})`);
  if (filters.availableOnly) conditions.push(eq(products.available, true));
  const where = and(...conditions);

  const order: SQL[] = [];
  if (filters.sort === "price-asc") order.push(sql`${products.minPriceUsd} ASC NULLS LAST`);
  else if (filters.sort === "price-desc") order.push(sql`${products.minPriceUsd} DESC NULLS LAST`);
  else if (filters.sort === "relevance" && filters.q) {
    // An exact SKU first, then real parts ahead of stickers and shirts, then the closest titles.
    order.push(
      sql`EXISTS (SELECT 1 FROM ${variants} WHERE ${variants.productId} = ${products.id} AND lower(${variants.supplierSku}) = ${filters.q.toLowerCase()}) DESC`,
      sql`${categories.slug} = 'other' ASC NULLS LAST`,
      sql`extensions.similarity(${products.title}, ${filters.q}) DESC`,
    );
  }
  order.push(asc(products.title));

  const rows = await db
    .select({
      id: products.id,
      handle: products.handle,
      title: products.title,
      images: products.images,
      minPriceUsd: products.minPriceUsd,
      maxPriceUsd: products.maxPriceUsd,
      available: products.available,
      lastSeenAt: products.lastSeenAt,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
    })
    .from(products)
    .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(where)
    .orderBy(...order)
    .limit(PAGE_SIZE)
    .offset((filters.page - 1) * PAGE_SIZE);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(where);

  return { rows, total };
}

export type ProductSummary = Awaited<ReturnType<typeof searchProducts>>["rows"][number];

/** Categories and suppliers that have something to show, with product counts. */
export async function getFacets() {
  await connection();
  const count = sql<number>`count(*)::int`;

  const [categoryRows, supplierRows] = await Promise.all([
    db
      .select({ slug: categories.slug, name: categories.name, count })
      .from(products)
      .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(visible)
      .groupBy(categories.slug, categories.name, categories.sortOrder)
      .orderBy(asc(categories.sortOrder)),
    db
      .select({ code: suppliers.code, name: suppliers.name, programs: suppliers.programs, count })
      .from(products)
      .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
      .where(visible)
      .groupBy(suppliers.code, suppliers.name, suppliers.programs)
      .orderBy(desc(count)),
  ]);

  return { categories: categoryRows, suppliers: supplierRows };
}

export async function getProduct(supplierCode: string, handle: string) {
  await connection();

  const [row] = await db
    .select({
      product: products,
      supplierName: suppliers.name,
      supplierCode: suppliers.code,
      categorySlug: categories.slug,
      categoryName: categories.name,
    })
    .from(products)
    .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(visible, eq(suppliers.code, supplierCode), eq(products.handle, handle)))
    .limit(1);
  if (!row) return null;

  const productVariants = await db
    .select()
    .from(variants)
    .where(and(eq(variants.productId, row.product.id), isNull(variants.missingSince)))
    .orderBy(asc(variants.position));

  return { ...row, variants: productVariants };
}
