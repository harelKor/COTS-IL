import "server-only";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import { PAGE_SIZE, searchPatterns, type CatalogFilters } from "./catalog-filters";

const { categories, productFamilies: families, products, suppliers, variants } = schema;

/** The catalog lists families: one part in all its sizes, from every supplier that sells it. */
const visible = and(eq(families.status, "published"), isNull(families.missingSince));

/** A family's variants that can be shown: their product is listed and published. */
const memberVariant = sql`${variants.familyId} = ${families.id} AND ${products.status} = 'published' AND ${products.missingSince} IS NULL AND ${variants.missingSince} IS NULL`;

/**
 * The catalog changes once a day, when the sync runs, so public catalog reads
 * are cached for hours. That lets pages render without a loading state.
 */
function catalogCache() {
  cacheLife("hours");
  cacheTag("catalog");
}

function searchQuery(filters: CatalogFilters) {
  const conditions: (SQL | undefined)[] = [visible];
  for (const pattern of searchPatterns(filters.q)) {
    conditions.push(sql`${families.searchText} ILIKE ${pattern}`);
  }
  if (filters.category) conditions.push(eq(categories.slug, filters.category));
  if (filters.supplier) conditions.push(sql`${filters.supplier} = ANY(${families.supplierCodes})`);
  if (filters.program) conditions.push(sql`${filters.program}::program = ANY(${families.programs})`);
  if (filters.availableOnly) conditions.push(eq(families.available, true));
  const where = and(...conditions);

  const order: SQL[] = [];
  if (filters.sort === "price-asc") order.push(sql`${families.minPriceUsd} ASC NULLS LAST`);
  else if (filters.sort === "price-desc") order.push(sql`${families.minPriceUsd} DESC NULLS LAST`);
  else if (filters.sort === "relevance" && filters.q) {
    // An exact SKU first, then real parts ahead of stickers and shirts, then the closest titles.
    order.push(
      sql`EXISTS (SELECT 1 FROM ${variants} JOIN ${products} ON ${products.id} = ${variants.productId} WHERE ${memberVariant} AND lower(${variants.supplierSku}) = ${filters.q.toLowerCase()}) DESC`,
      sql`${categories.slug} = 'other' ASC NULLS LAST`,
      sql`extensions.similarity(${families.title}, ${filters.q}) DESC`,
    );
  }
  order.push(asc(families.title));
  return { where, order };
}

/** Supplier names by code, for showing a family's suppliers. */
async function supplierNames() {
  const rows = await db.select({ code: suppliers.code, name: suppliers.name }).from(suppliers);
  return new Map(rows.map((r) => [r.code, r.name]));
}

export async function searchProducts(filters: CatalogFilters) {
  "use cache";
  catalogCache();
  const { where, order } = searchQuery(filters);

  const [rows, [{ total }], names] = await Promise.all([
    db
      .select({
        id: families.id,
        slug: families.slug,
        title: families.title,
        images: families.images,
        minPriceUsd: families.minPriceUsd,
        maxPriceUsd: families.maxPriceUsd,
        available: families.available,
        lastSeenAt: families.lastSeenAt,
        supplierCodes: families.supplierCodes,
        variantCount: families.variantCount,
      })
      .from(families)
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(where)
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(families)
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(where),
    supplierNames(),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, supplierNames: r.supplierCodes.map((c) => names.get(c) ?? c) })),
    total,
  };
}

export type ProductSummary = Awaited<ReturnType<typeof searchProducts>>["rows"][number];

/** Categories and suppliers that have something to show, with family counts. */
export async function getFacets() {
  "use cache";
  catalogCache();
  const count = sql<number>`count(*)::int`;

  const [categoryRows, supplierRows] = await Promise.all([
    db
      .select({ slug: categories.slug, name: categories.name, count })
      .from(families)
      .innerJoin(categories, eq(categories.id, families.categoryId))
      .where(visible)
      .groupBy(categories.slug, categories.name, categories.sortOrder)
      .orderBy(asc(categories.sortOrder)),
    db
      .select({ code: suppliers.code, name: suppliers.name, programs: suppliers.programs, count })
      .from(families)
      .innerJoin(suppliers, sql`${suppliers.code} = ANY(${families.supplierCodes})`)
      .where(and(visible, eq(suppliers.active, true)))
      .groupBy(suppliers.code, suppliers.name, suppliers.programs)
      .orderBy(desc(count)),
  ]);

  return { categories: categoryRows, suppliers: supplierRows };
}

/** A family with every listed variant, from every supplier that sells it. */
export async function getFamily(slug: string) {
  "use cache";
  catalogCache();

  const [row] = await db
    .select({ family: families, categorySlug: categories.slug, categoryName: categories.name })
    .from(families)
    .leftJoin(categories, eq(categories.id, families.categoryId))
    .where(and(visible, eq(families.slug, slug)))
    .limit(1);
  if (!row) return null;

  const familyVariants = await db
    .select({
      id: variants.id,
      sku: variants.supplierSku,
      familyOptions: variants.familyOptions,
      options: variants.options,
      priceUsd: variants.priceUsd,
      available: variants.available,
      checkedAt: variants.checkedAt,
      productTitle: products.title,
      productUrl: products.url,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(sql`${variants.familyId} = ${row.family.id} AND ${products.status} = 'published' AND ${products.missingSince} IS NULL AND ${variants.missingSince} IS NULL`)
    .orderBy(asc(products.title), asc(variants.position));

  return { ...row, variants: familyVariants };
}

export type FamilyVariant = NonNullable<Awaited<ReturnType<typeof getFamily>>>["variants"][number];

/**
 * Where an old product URL (/catalog/wcp/wcp-0749) now lives: its family, with
 * the variant to select. A WCP collection page has no family and goes to its category.
 */
export async function resolveProductUrl(supplierCode: string, handle: string) {
  "use cache";
  catalogCache();

  const [row] = await db
    .select({
      familySlug: families.slug,
      familyVisible: sql<boolean>`${families.status} = 'published' AND ${families.missingSince} IS NULL`,
      categorySlug: categories.slug,
      variantId: variants.id,
      sku: variants.supplierSku,
    })
    .from(products)
    .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(variants, sql`${variants.productId} = ${products.id} AND ${variants.missingSince} IS NULL`)
    .leftJoin(families, eq(families.id, variants.familyId))
    .where(and(eq(suppliers.code, supplierCode), eq(products.handle, handle), isNull(products.missingSince)))
    .orderBy(sql`${products.status} = 'published' DESC`, asc(variants.position))
    .limit(1);
  if (!row) return null;

  return {
    familySlug: row.familySlug && row.familyVisible ? row.familySlug : null,
    categorySlug: row.categorySlug,
    variant: row.sku ?? row.variantId,
  };
}

/** Variants a team can add: listed, published, with a price. */
const orderable = sql`${memberVariant} AND ${variants.priceUsd} > 0`;

/**
 * The few best matches for the search panel. When a family is a single part (one
 * SKU, even if several suppliers sell it), it carries the variant to add: the
 * cheapest one in stock. Then the panel can add it without opening the page.
 */
export async function quickSearch(q: string) {
  "use cache";
  catalogCache();
  const filters: CatalogFilters = { q, category: "", supplier: "", program: "", availableOnly: false, sort: "relevance", page: 1 };
  const { where, order } = searchQuery(filters);
  const part = sql`coalesce(upper(${variants.supplierSku}), ${variants.id}::text)`;
  const fromFamily = sql`FROM ${variants} JOIN ${products} ON ${products.id} = ${variants.productId} WHERE ${orderable}`;

  const [rows, names] = await Promise.all([
    db
      .select({
        id: families.id,
        slug: families.slug,
        title: families.title,
        image: sql<string | null>`${families.images}[1]`,
        minPriceUsd: families.minPriceUsd,
        maxPriceUsd: families.maxPriceUsd,
        available: families.available,
        supplierCodes: families.supplierCodes,
        variantCount: sql<number>`(SELECT count(DISTINCT ${part})::int ${fromFamily})`,
        onlyVariant: sql<{ id: string; sku: string | null } | null>`(
          SELECT CASE WHEN count(DISTINCT ${part}) = 1 THEN
            (array_agg(json_build_object('id', ${variants.id}, 'sku', ${variants.supplierSku})
              ORDER BY ${variants.available} IS TRUE DESC, ${variants.priceUsd} ASC))[1]
          END ${fromFamily})`,
      })
      .from(families)
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(where)
      .orderBy(...order)
      .limit(8),
    supplierNames(),
  ]);

  return rows.map((r) => ({ ...r, supplierNames: r.supplierCodes.map((c) => names.get(c) ?? c) }));
}

export type QuickResult = Awaited<ReturnType<typeof quickSearch>>[number];

/** For the admin grouping page: how each supplier's SKUs grouped, and what was left for review. */
export async function getGroupingReport() {
  const { groupingIssues } = schema;
  const [bySupplier, byGrouping, [{ multi }], issues] = await Promise.all([
    db
      .select({
        code: suppliers.code,
        name: suppliers.name,
        variants: sql<number>`count(DISTINCT ${variants.id})::int`,
        families: sql<number>`count(DISTINCT ${families.id})::int`,
      })
      .from(families)
      .innerJoin(variants, sql`${variants.familyId} = ${families.id} AND ${variants.missingSince} IS NULL`)
      .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
      .where(visible)
      .groupBy(suppliers.code, suppliers.name)
      .orderBy(suppliers.name),
    db
      .select({ grouping: families.grouping, count: sql<number>`count(*)::int` })
      .from(families)
      .where(visible)
      .groupBy(families.grouping),
    db
      .select({ multi: sql<number>`count(*)::int` })
      .from(families)
      .where(and(visible, sql`cardinality(${families.supplierCodes}) > 1`)),
    db
      .select({
        reason: groupingIssues.reason,
        detail: groupingIssues.detail,
        handle: products.handle,
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
      })
      .from(groupingIssues)
      .innerJoin(products, eq(products.id, groupingIssues.productId))
      .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
      .orderBy(groupingIssues.reason, suppliers.name, groupingIssues.detail),
  ]);
  return { bySupplier, byGrouping, multiSupplier: multi, issues };
}
