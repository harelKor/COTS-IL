import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import { ACCESSORY_TITLE_PATTERN, HARDWARE_CATEGORIES, MAIN_ITEM_MIN_USD } from "@/domain/catalog-rank";
import { isRelevantFacet } from "@/domain/facets";
import type { CompanionRule } from "@/domain/families/companions";
import { priceIls } from "@/domain/pricing";
import { usdIlsRate } from "./fx";
import { searchPatterns, type CatalogFilters } from "./catalog-filters";
import { familyHref } from "./catalog-links";

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

/** Families with a spec value among `values` for `key`. */
function hasSpec(key: string, values: string[]) {
  const sv = schema.specValues;
  return sql`EXISTS (SELECT 1 FROM ${sv} WHERE ${sv.familyId} = ${families.id} AND ${sv.key} = ${key} AND ${sv.value} IN (${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}))`;
}

/**
 * What a team came for first (available, not an accessory, a main item), the screws and
 * spacers filed with it after. The same steps as rankKey in src/domain/catalog-rank.ts.
 * Needs `categories` joined.
 */
function mainItemsFirst(): SQL[] {
  return [
    sql`${families.available} IS TRUE DESC`,
    sql`(${families.title} ~* ${ACCESSORY_TITLE_PATTERN} AND coalesce(${categories.slug}, '') NOT IN (${sql.join(HARDWARE_CATEGORIES.map((c) => sql`${c}`), sql`, `)})) ASC`,
    sql`(coalesce(${families.minPriceUsd}, 0) >= ${MAIN_ITEM_MIN_USD} OR ${families.variantCount} >= 3) DESC`,
  ];
}

/** `withSpecs: false` leaves out the spec filters, for counting the values each spec could take. */
function searchQuery(filters: CatalogFilters, { withSpecs = true } = {}) {
  const conditions: (SQL | undefined)[] = [visible];
  for (const pattern of searchPatterns(filters.q)) {
    conditions.push(sql`${families.searchText} ILIKE ${pattern}`);
  }
  if (filters.category) conditions.push(eq(categories.slug, filters.category));
  if (filters.supplier) conditions.push(sql`${filters.supplier} = ANY(${families.supplierCodes})`);
  if (filters.program) conditions.push(sql`${filters.program}::program = ANY(${families.programs})`);
  if (filters.availableOnly) conditions.push(eq(families.available, true));
  if (withSpecs) for (const [key, values] of Object.entries(filters.specs)) conditions.push(hasSpec(key, values));
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
  } else if (filters.sort === "relevance") {
    // Browsing with no search: what a team came for first, the screws and spacers filed with it after.
    order.push(...mainItemsFirst());
    if (!filters.category) order.push(sql`${categories.slug} = 'other' ASC NULLS LAST`);
  }
  order.push(asc(families.title));
  return { where, order };
}

/** Supplier names by code, for showing a family's suppliers. */
async function supplierNames() {
  const rows = await db.select({ code: suppliers.code, name: suppliers.name }).from(suppliers);
  return new Map(rows.map((r) => [r.code, r.name]));
}

export type CardVariant = {
  id: string;
  sku: string | null;
  options: Record<string, string>;
  priceIls: number | null;
  available: boolean | null;
  supplierName: string;
  image: string | null;
};

/**
 * A family in the catalog, light enough to send by the dozen: no variant list.
 * A card with options loads its variants on the first "+" (/api/family/[id]/variants).
 */
export type CardFamily = {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  supplierNames: string[];
  minPriceIls: number | null;
  maxPriceIls: number | null;
  available: boolean | null;
  checkedAt: string;
  variantCount: number;
  optionKeys: string[];
  /** Whether anything in the family can be added (listed, with a price). */
  orderable: boolean;
  /** Set when the family is one part (one set of options): the offer to add, cheapest in stock. */
  onlyVariant: CardVariant | null;
};

const cardColumns = {
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
  optionKeys: families.optionKeys,
};

type CardRow = {
  id: string;
  slug: string;
  title: string;
  images: string[];
  minPriceUsd: string | null;
  maxPriceUsd: string | null;
  available: boolean | null;
  lastSeenAt: Date;
  supplierCodes: string[];
  variantCount: number;
  optionKeys: string[];
};

/** Orderable variants of these families, cheapest in stock first. */
async function variantsOf(familyIds: string[], rate: number) {
  if (familyIds.length === 0) return [];
  const rows = await db
    .select({
      familyId: variants.familyId,
      id: variants.id,
      sku: variants.supplierSku,
      options: variants.familyOptions,
      priceUsd: variants.priceUsd,
      available: variants.available,
      supplierName: suppliers.name,
      image: sql<string | null>`${products.images}[1]`,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(
      and(
        inArray(variants.familyId, familyIds),
        eq(products.status, "published"),
        isNull(products.missingSince),
        isNull(variants.missingSince),
        sql`${variants.priceUsd} > 0`,
      ),
    )
    .orderBy(sql`${variants.available} IS TRUE DESC`, asc(variants.priceUsd));
  return rows.map((v) => ({
    familyId: v.familyId!,
    variant: { id: v.id, sku: v.sku, options: v.options, priceIls: priceIls(v.priceUsd, rate), available: v.available, supplierName: v.supplierName, image: v.image } satisfies CardVariant,
  }));
}

/** A card's variants, for its option chips. Cached: the catalog changes once a day. */
export async function getCardVariants(familyId: string): Promise<CardVariant[]> {
  "use cache";
  catalogCache();
  const rate = await usdIlsRate();
  return (await variantsOf([familyId], rate)).map((r) => r.variant);
}

/** What family cards need, keeping the rows' order. Only single-part families carry their variant. */
async function toCards(rows: CardRow[]): Promise<CardFamily[]> {
  if (rows.length === 0) return [];
  const rate = await usdIlsRate();
  const names = await supplierNames();
  const ids = rows.map((r) => r.id);
  // Per family: how many option sets can be ordered, and the best offer.
  const shape = await db
    .select({
      familyId: variants.familyId,
      sets: sql<number>`count(DISTINCT ${variants.familyOptions})::int`,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(inArray(variants.familyId, ids), eq(products.status, "published"), isNull(products.missingSince), isNull(variants.missingSince), sql`${variants.priceUsd} > 0`))
    .groupBy(variants.familyId);
  const sets = new Map(shape.map((r) => [r.familyId!, r.sets]));
  const single = ids.filter((id) => sets.get(id) === 1);
  const only = new Map<string, CardVariant>();
  for (const { familyId, variant } of await variantsOf(single, rate)) if (!only.has(familyId)) only.set(familyId, variant);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    image: r.images[0] ?? null,
    supplierNames: r.supplierCodes.map((c) => names.get(c) ?? c),
    minPriceIls: priceIls(r.minPriceUsd, rate),
    maxPriceIls: priceIls(r.maxPriceUsd, rate),
    available: r.available,
    checkedAt: r.lastSeenAt.toISOString(),
    variantCount: r.variantCount,
    optionKeys: r.optionKeys,
    orderable: (sets.get(r.id) ?? 0) > 0,
    onlyVariant: only.get(r.id) ?? null,
  }));
}

/** A slice of the catalog as cards, from `offset`, with the number of families that match. */
export async function searchCards(filters: CatalogFilters, offset: number, limit: number) {
  "use cache";
  catalogCache();
  const { where, order } = searchQuery(filters);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select(cardColumns)
      .from(families)
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(where)
      .orderBy(...order)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(families)
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(where),
  ]);
  return { cards: await toCards(rows), total };
}

/** Sizes and specs to filter by, with how many families have each value. */
export type SpecFacet = { key: string; values: { value: string; count: number }[] };

/** Keys shown first, in this order, when a list has them. */
const FACET_ORDER = ["dp", "pitch", "teeth", "bore", "width", "id", "od", "length", "cd", "material"];
const MAX_FACETS = 6;

/**
 * The spec filters worth offering for the current list: keys whose values
 * differ between families, the usual ones first. Counted without the spec
 * filters themselves, so picking one bore doesn't hide the others.
 */
export async function getSpecFacets(filters: CatalogFilters): Promise<SpecFacet[]> {
  "use cache";
  catalogCache();
  if (!filters.category && !filters.q) return [];
  const { where } = searchQuery(filters, { withSpecs: false });
  const sv = schema.specValues;

  const specRows = and(where, sql`length(${sv.key}) <= 24`);

  const [rows, keyRows, [{ total }]] = await Promise.all([
    db
      .select({
        key: sv.key,
        value: sv.value,
        num: sql<string | null>`min(${sv.num})`,
        count: sql<number>`count(DISTINCT ${sv.familyId})::int`,
      })
      .from(sv)
      .innerJoin(families, eq(families.id, sv.familyId))
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(specRows)
      .groupBy(sv.key, sv.value),
    // How many of the products in view have each spec at all.
    db
      .select({ key: sv.key, families: sql<number>`count(DISTINCT ${sv.familyId})::int` })
      .from(sv)
      .innerJoin(families, eq(families.id, sv.familyId))
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(specRows)
      .groupBy(sv.key),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(families)
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(where),
  ]);

  const byKey = new Map<string, { value: string; count: number; num: number | null }[]>();
  for (const r of rows) {
    byKey.set(r.key, [...(byKey.get(r.key) ?? []), { value: r.value, count: r.count, num: r.num === null ? null : Number(r.num) }]);
  }
  const reach = new Map(keyRows.map((r) => [r.key, r.families]));
  const selected = Object.keys(filters.specs);

  const rank = (key: string) => (FACET_ORDER.includes(key) ? FACET_ORDER.indexOf(key) : 99);
  return [...byKey]
    .filter(([key, values]) => isRelevantFacet({ key, families: reach.get(key) ?? 0, values: values.length }, total, selected))
    .map(([key, values]) => ({ key, values, reach: reach.get(key) ?? 0 }))
    .sort((a, b) => rank(a.key) - rank(b.key) || b.reach - a.reach)
    .slice(0, MAX_FACETS)
    .map(({ key, values }) => ({
      key,
      values: values
        .sort((a, b) =>
          a.num !== null && b.num !== null && a.num !== b.num ? a.num - b.num : a.value.localeCompare(b.value, "en", { numeric: true }),
        )
        .slice(0, 60)
        .map(({ value, count }) => ({ value, count })),
    }));
}

/**
 * Suppliers that sell something in view (the category and search, any supplier), with how
 * many products each has there. The chosen supplier stays even when it has none.
 */
export async function getSupplierCounts(filters: CatalogFilters) {
  "use cache";
  catalogCache();
  const { where } = searchQuery({ ...filters, supplier: "" });
  const count = sql<number>`count(DISTINCT ${families.id})::int`;
  return db
    .select({ code: suppliers.code, name: suppliers.name, count })
    .from(families)
    .leftJoin(categories, eq(categories.id, families.categoryId))
    .innerJoin(suppliers, sql`${suppliers.code} = ANY(${families.supplierCodes})`)
    .where(and(where, eq(suppliers.active, true)))
    .groupBy(suppliers.code, suppliers.name)
    .orderBy(desc(count));
}

/**
 * Categories and suppliers that have something to show, with family counts. Each category
 * also carries up to three photos of its main items (motors, not the screws filed next to them).
 */
export async function getFacets() {
  "use cache";
  catalogCache();
  const count = sql<number>`count(*)::int`;

  // One after another, not in parallel: on a cold instance this fills the cache while other
  // renders need the same 5 connections (src/db/index.ts).
  const categoryRows = await db
    .select({ slug: categories.slug, name: categories.name, images: categories.images, count })
    .from(families)
    .innerJoin(categories, eq(categories.id, families.categoryId))
    .where(visible)
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder));
  const supplierRows = await db
    .select({ code: suppliers.code, name: suppliers.name, programs: suppliers.programs, count })
    .from(families)
    .innerJoin(suppliers, sql`${suppliers.code} = ANY(${families.supplierCodes})`)
    .where(and(visible, eq(suppliers.active, true)))
    .groupBy(suppliers.code, suppliers.name, suppliers.programs)
    .orderBy(desc(count));

  return {
    categories: categoryRows,
    suppliers: supplierRows,
  };
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
      productDescription: products.descriptionHtml,
      image: sql<string | null>`${products.images}[1]`,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(sql`${variants.familyId} = ${row.family.id} AND ${products.status} = 'published' AND ${products.missingSince} IS NULL AND ${variants.missingSince} IS NULL`)
    .orderBy(asc(products.title), asc(variants.position));

  const specRows = await db
    .select({ variantId: schema.specValues.variantId, key: schema.specValues.key, value: schema.specValues.value })
    .from(schema.specValues)
    .where(eq(schema.specValues.familyId, row.family.id));
  const specs: Record<string, { key: string; value: string }[]> = {};
  for (const r of specRows) if (r.variantId) (specs[r.variantId] ??= []).push({ key: r.key, value: r.value });

  return { ...row, variants: familyVariants, specs };
}

/** An ILIKE pattern matching `text` anywhere, with wildcards in it taken literally. */
function likeAnywhere(text: string) {
  return `%${text.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * Families that go with a part ("usually ordered with"), by the rules in
 * src/domain/families/companions.ts. In-stock and cheaper ones first.
 */
export async function getCompanions(familyId: string, rules: CompanionRule[]): Promise<CardFamily[]> {
  "use cache";
  catalogCache();
  const rows: CardRow[] = [];
  for (const rule of rules) {
    const conditions: (SQL | undefined)[] = [
      visible,
      eq(categories.slug, rule.category),
      sql`${families.id} <> ${familyId}`,
      ...rule.terms.map((t) => sql`${families.searchText} ILIKE ${likeAnywhere(t)}`),
      ...(rule.without ?? []).map((t) => sql`${families.title} NOT ILIKE ${likeAnywhere(t)}`),
    ];
    const found = await db
      .select(cardColumns)
      .from(families)
      .leftJoin(categories, eq(categories.id, families.categoryId))
      .where(and(...conditions))
      .orderBy(sql`${families.available} IS TRUE DESC`, sql`${families.variantCount} DESC`, asc(families.minPriceUsd))
      .limit(4);
    for (const f of found) if (!rows.some((r) => r.id === f.id)) rows.push(f);
  }
  return toCards(rows.slice(0, 8));
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
  const filters: CatalogFilters = { q, category: "", supplier: "", program: "", availableOnly: false, sort: "relevance", page: 1, specs: {}, view: "grid" };
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

/** The parts of a shared cart link, as cart lines, with the family each belongs to. Gone parts are left out. */
export async function getSharedLines(variantIds: string[]) {
  "use cache";
  catalogCache();
  if (variantIds.length === 0) return [];
  const rate = await usdIlsRate();
  const rows = await db
    .select({
      variantId: variants.id,
      sku: variants.supplierSku,
      options: variants.familyOptions,
      priceUsd: variants.priceUsd,
      title: products.title,
      image: sql<string | null>`${products.images}[1]`,
      supplierName: suppliers.name,
      familySlug: families.slug,
      familyTitle: families.title,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .leftJoin(families, eq(families.id, variants.familyId))
    .where(and(inArray(variants.id, variantIds), isNull(variants.missingSince), isNull(products.missingSince), eq(products.status, "published"), sql`${variants.priceUsd} > 0`));
  return rows.map((r) => ({
    variantId: r.variantId,
    title: r.familyTitle ?? r.title,
    options: Object.values(r.options).join(" / "),
    sku: r.sku,
    image: r.image,
    href: r.familySlug ? familyHref(r.familySlug, r.sku ?? r.variantId) : "/catalog",
    supplierName: r.supplierName,
    unitPriceIls: priceIls(r.priceUsd, rate),
  }));
}

/** When the catalog last synced successfully from any supplier, for "prices updated …" on the home page. */
export async function getLastSync(): Promise<Date | null> {
  "use cache";
  catalogCache();
  const jobs = schema.syncJobs;
  const [row] = await db
    .select({ at: sql<string | null>`max(${jobs.finishedAt})` })
    .from(jobs)
    .where(eq(jobs.status, "succeeded"));
  return row?.at ? new Date(row.at) : null;
}
