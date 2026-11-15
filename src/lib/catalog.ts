import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import { tallyFamilies, type CatalogCounts } from "@/domain/catalog-counts";
import { ACCESSORY_TITLE_PATTERN, HARDWARE_CATEGORIES, MAIN_ITEM_MIN_USD } from "@/domain/catalog-rank";
import { facetCountPlans, isRelevantFacet } from "@/domain/facets";
import { sortValue } from "@/domain/specs/units";
import type { CompanionRule } from "@/domain/families/companions";
import { priceIls } from "@/domain/pricing";
import { interleave, pageCount, pickDiscovery, rankPopular, wrappedPage, type FamilySignals } from "@/domain/popular";
import { groupOf } from "@/domain/category-groups";
import { allStale, isStale, someStale } from "@/domain/stale-price";
import { getStaleSupplierCodes } from "./health";
import { getSettings, priceContext } from "./settings";
import type { PriceContext } from "@/domain/pricing";
import { correctQuery, englishQuery, likePatterns, likePrefix, looksLikeSku, normalizeSku, searchTerms } from "@/domain/search-query";
import { prefixPhrase } from "@/domain/search-rank";
import type { CatalogFilters } from "./catalog-filters";
import { familyHref } from "./catalog-links";

const { categories, productFamilies: families, products, suppliers, variants } = schema;

/** The catalog lists families: one part in all its sizes, from every supplier that sells it. */
const visible = and(eq(families.status, "published"), isNull(families.missingSince));

/** A family's variants that can be shown: their product is listed and published. */
const memberVariant = sql`${variants.familyId} = ${families.id} AND ${products.status} = 'published' AND ${products.missingSince} IS NULL AND ${variants.missingSince} IS NULL`;

/**
 * The catalog changes once a day, when the sync runs, so public catalog reads
 * are cached for hours. That lets pages render without a loading state.
 *
 * Two kinds of cache (Nov 14, 2026, docs/AUDIT-2026-11-14.md S-2):
 * - `"use cache"` lives in one server instance's memory, so every new instance starts empty.
 * - `"use cache: remote"` is Vercel's Runtime Cache, shared by every instance in the region.
 *   Each hit is a network read, so it's for the hot reads every visitor shares (facets,
 *   vendors, stores, the discovery pool, product pages, plain category browsing). Searches and
 *   spec filters, with their endless keys, stay in memory.
 * Each shared read sits behind an in-memory one of the same name (getFacets → facetsShared):
 * an instance that already has it answers from memory, a new instance reads the region's copy
 * instead of the database. Neither survives a deploy (the key includes the build id).
 * Both carry the `catalog` tag, so /api/revalidate and admin saves expire them.
 */
function catalogCache() {
  cacheLife("hours");
  cacheTag("catalog");
}

/**
 * Variants that have, for every spec filter, one of its values: one part that is both
 * 1/2" Hex and 24 teeth, not a family with a 1/2" Hex 20T and a 3/8" Hex 24T. Null with no filters.
 */
function specVariants(specs: Record<string, string[]>): SQL | null {
  const sv = schema.specValues;
  const entries = Object.entries(specs).filter(([, values]) => values.length > 0);
  if (entries.length === 0) return null;
  const any = sql.join(
    entries.map(([key, values]) => sql`(${sv.key} = ${key} AND ${sv.value} IN (${sql.join(values.map((v) => sql`${v}`), sql`, `)}))`),
    sql` OR `,
  );
  return sql`SELECT ${sv.variantId} FROM ${sv} WHERE ${any} GROUP BY ${sv.variantId} HAVING count(DISTINCT ${sv.key}) = ${entries.length}`;
}

/** Families with a listed variant that passes every spec filter. */
function hasSpecs(specs: Record<string, string[]>) {
  const ids = specVariants(specs);
  return ids && sql`EXISTS (SELECT 1 FROM ${variants} WHERE ${variants.familyId} = ${families.id} AND ${variants.missingSince} IS NULL AND ${variants.id} IN (${ids}))`;
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

/**
 * The same expression as the index `variants_sku_norm_idx`: letters and digits of the
 * SKU, lowercase, so "wcp0749", "WCP 0749" and "wcp-0749" find WCP-0749.
 */
const skuNorm = sql`regexp_replace(lower(${variants.supplierSku}), '[^a-z0-9]', '', 'g')`;

/**
 * What a search matches: every word (or one of its synonyms) in the family's search
 * text, or a variant whose SKU is the search. Null without a search; a search of only
 * unknown Hebrew words matches nothing.
 */
function textMatch(q: string) {
  if (!q.trim()) return null;
  const terms = searchTerms(q);
  const anyOf = (column: SQL | typeof families.searchText, patterns: string[]) =>
    sql`(${sql.join(
      patterns.map((p) => sql`${column} ILIKE ${p}`),
      sql` OR `,
    )})`;
  const words = terms.length > 0 ? and(...terms.map((t) => anyOf(families.searchText, likePatterns(t))))! : sql`false`;
  const inTitle = terms.length > 0 ? and(...terms.map((t) => anyOf(sql`${families.title}`, likePatterns(t))))! : null;
  // A search of two words or more that the title starts with: "kraken x60" → "Kraken X60 …" (prefixPhrase).
  const phrase = prefixPhrase(q);
  const prefix = phrase ? sql`lower(${families.title}) LIKE ${likePrefix(phrase)}` : null;
  const english = englishQuery(q) || q;
  const exact = sql`lower(btrim(${families.title})) IN (${q.trim().toLowerCase()}, ${english.toLowerCase()})`;
  const sku = looksLikeSku(q) ? sql`${families.id} IN (SELECT ${variants.familyId} FROM ${variants} WHERE ${skuNorm} = ${normalizeSku(q)})` : null;
  return { where: sku ? sql`(${words} OR ${sku})` : words, inTitle, prefix, exact, sku, english };
}

/** The filters with a group resolved to its categories (resolvedKey). */
type ResolvedFilters = CatalogFilters & { groupSlugs?: string[] };

/** A group's category slugs (a category with no valid group is in the last one, see groupOf); undefined for no or an unknown group. */
async function groupSlugs(group: string): Promise<string[] | undefined> {
  if (!group) return undefined;
  const [{ categories: cats }, { content }] = await Promise.all([getFacets(), getSettings()]);
  const groups = content.categoryGroups;
  if (!groups.some((g) => g.id === group)) return undefined;
  return cats.filter((c) => groupOf(c.group, groups) === group).map((c) => c.slug).sort();
}

/** The filters as a cache key, with the group resolved to its categories (so a group edit makes a new key). */
async function resolvedKey(filters: CatalogFilters, keep?: { sort?: boolean; supplier?: boolean }): Promise<ResolvedFilters> {
  const key = cacheKey(filters, keep);
  return key.group ? { ...key, groupSlugs: await groupSlugs(key.group) } : key;
}

/** `withSpecs: false` leaves out the spec filters, for counting the values each spec could take. */
function searchQuery(filters: ResolvedFilters, { withSpecs = true } = {}) {
  const conditions: (SQL | undefined)[] = [visible];
  if (filters.groupSlugs) conditions.push(filters.groupSlugs.length > 0 ? inArray(categories.slug, filters.groupSlugs) : sql`false`);
  const text = textMatch(filters.q);
  if (text) conditions.push(text.where);
  if (filters.category) conditions.push(eq(categories.slug, filters.category));
  if (filters.supplier) conditions.push(sql`${filters.supplier} = ANY(${families.supplierCodes})`);
  if (filters.program) conditions.push(sql`${filters.program}::program = ANY(${families.programs})`);
  if (filters.availableOnly) conditions.push(eq(families.available, true));
  if (withSpecs) conditions.push(hasSpecs(filters.specs) ?? undefined);
  const where = and(...conditions);

  const order: SQL[] = [];
  if (filters.sort === "price-asc") order.push(sql`${families.minListUsd} ASC NULLS LAST`);
  else if (filters.sort === "price-desc") order.push(sql`${families.minListUsd} DESC NULLS LAST`);
  else if (filters.sort === "relevance" && text) {
    // The steps of rankSearch in src/domain/search-rank.ts: an exact SKU, the exact title, a title that
    // starts with a search of 2+ words, in stock, every word in the title, a real category, the part
    // ahead of its screws and covers, main items, the closest title.
    if (text.sku) order.push(sql`${text.sku} DESC`);
    order.push(
      sql`${text.exact} DESC`,
      ...(text.prefix ? [sql`${text.prefix} DESC`] : []),
      sql`${families.available} IS TRUE DESC`,
      ...(text.inTitle ? [sql`${text.inTitle} DESC`] : []),
      sql`coalesce(${categories.slug}, 'other') = 'other' ASC`,
      sql`(${families.title} ~* ${ACCESSORY_TITLE_PATTERN} AND coalesce(${categories.slug}, '') NOT IN (${sql.join(HARDWARE_CATEGORIES.map((c) => sql`${c}`), sql`, `)})) ASC`,
      sql`(coalesce(${families.minPriceUsd}, 0) >= ${MAIN_ITEM_MIN_USD} OR ${families.variantCount} >= 3) DESC`,
      sql`extensions.similarity(${families.title}, ${text.english}) DESC`,
    );
  } else if (filters.sort === "relevance") {
    // Browsing with no search: what a team came for first, the screws and spacers filed with it after.
    // Then the lines with the most sizes (the staple gear or bearing families), then names
    // that are words before names that start with a size ("1/2in Hex Bore…").
    // The admin's pinned favourites come first (S15).
    order.push(sql`${families.pinnedRank} ASC NULLS LAST`, ...mainItemsFirst());
    if (!filters.category) order.push(sql`${categories.slug} = 'other' ASC NULLS LAST`);
    order.push(sql`(cardinality(${families.images}) > 0) DESC`, desc(families.variantCount), sql`${families.title} ~ '^[0-9#]' ASC`);
  }
  // The id last: two families of the same title keep one order on every render and page.
  order.push(asc(families.title), asc(families.id));
  return { where, order };
}

/** Every supplier's code and name. Cached with the catalog: the admin's supplier edits expire it. */
async function supplierNameRows(): Promise<{ code: string; name: string }[]> {
  "use cache";
  catalogCache();
  return db.select({ code: suppliers.code, name: suppliers.name }).from(suppliers);
}

/** Supplier names by code, for showing a family's suppliers. */
async function supplierNames() {
  return new Map((await supplierNameRows()).map((r) => [r.code, r.name]));
}

export type CardVariant = {
  id: string;
  sku: string | null;
  options: Record<string, string>;
  priceIls: number | null;
  available: boolean | null;
  /** Orderable, but the supplier ships it later (בהזמנה מראש), with its ETA words if any. */
  shipsLater: boolean;
  shipsLaterEta: string | null;
  supplierName: string;
  supplierCode: string;
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
  /** The suppliers' codes, for their lead times (arrival on the card). */
  supplierCodes: string[];
  minPriceIls: number | null;
  maxPriceIls: number | null;
  available: boolean | null;
  /** Every available offer ships later (בהזמנה מראש). */
  shipsLater: boolean;
  checkedAt: string;
  variantCount: number;
  optionKeys: string[];
  /** Whether anything in the family can be added (listed, with a price). */
  orderable: boolean;
  /** Distinct option sets that can be ordered, and how many of them the supplier has in stock. */
  optionSets?: number;
  availableOptionSets?: number;
  /** Set when the family is one part (one set of options): the offer to add, cheapest in stock. */
  onlyVariant: CardVariant | null;
  /** When the search is one of its SKUs: that variant's options, chosen on the card. */
  skuPreset?: Record<string, string>;
  /** In a vendor's store: the card shows only this vendor's offer (prices, options, stock). */
  vendor?: { code: string; name: string };
};

const cardColumns = {
  id: families.id,
  slug: families.slug,
  title: families.title,
  images: families.images,
  minListUsd: families.minListUsd,
  maxListUsd: families.maxListUsd,
  available: families.available,
  shipsLater: families.shipsLater,
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
  /** USD × each variant's multiplier (S16a): priceIls(…, rate, 1) gives the ₪ range. */
  minListUsd: string | null;
  maxListUsd: string | null;
  available: boolean | null;
  shipsLater: boolean;
  lastSeenAt: Date;
  supplierCodes: string[];
  variantCount: number;
  optionKeys: string[];
};

/**
 * Orderable variants of these families, cheapest in stock first. A stale supplier's variants
 * come with no price ("המחיר ייבדק בהצעה", M1): `stale` is read inside the cached readers, so
 * the catalog tag expires it with everything else.
 */
async function variantsOf(familyIds: string[], rate: PriceContext, supplierCode?: string) {
  if (familyIds.length === 0) return [];
  const stale = await getStaleSupplierCodes();
  const rows = await db
    .select({
      familyId: variants.familyId,
      id: variants.id,
      sku: variants.supplierSku,
      options: variants.familyOptions,
      priceUsd: variants.priceUsd,
      markup: variants.markup,
      fixedIls: variants.fixedIls,
      available: variants.available,
      shipsLater: variants.shipsLater,
      shipsLaterEta: variants.shipsLaterEta,
      supplierName: suppliers.name,
      supplierCode: suppliers.code,
      image: sql<string | null>`${products.images}[1]`,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(
      and(
        inArray(variants.familyId, familyIds),
        supplierCode ? eq(suppliers.code, supplierCode) : undefined,
        eq(products.status, "published"),
        isNull(products.missingSince),
        isNull(variants.missingSince),
        sql`${variants.priceUsd} > 0`,
      ),
    )
    .orderBy(sql`${variants.available} IS TRUE DESC`, asc(variants.priceUsd));
  return rows.map((v) => ({
    familyId: v.familyId!,
    variant: { id: v.id, sku: v.sku, options: v.options, priceIls: isStale(v.supplierCode, stale) ? null : priceIls(v.priceUsd, rate, v.markup, v.fixedIls), available: v.available, shipsLater: v.shipsLater, shipsLaterEta: v.shipsLaterEta, supplierName: v.supplierName, supplierCode: v.supplierCode, image: v.image } satisfies CardVariant,
  }));
}

/** A card's variants, for its option chips. Cached: the catalog changes once a day. */
export async function getCardVariants(familyId: string): Promise<CardVariant[]> {
  "use cache";
  catalogCache();
  const rate = await priceContext();
  return (await variantsOf([familyId], rate)).map((r) => r.variant);
}

/**
 * What family cards need, keeping the rows' order. Only single-part families carry their variant.
 * With a vendor, everything on the card (price range, stock, options, the part to add) is that
 * vendor's offer only: a family sold by WCP and CTRE shows WCP's price in the WCP store.
 */
async function toCards(rows: CardRow[], supplierCode?: string): Promise<CardFamily[]> {
  if (rows.length === 0) return [];
  const [rate, stale] = await Promise.all([priceContext(), getStaleSupplierCodes()]);
  const ids = rows.map((r) => r.id);
  // The range over the suppliers that aren't stale, for a card that has both kinds.
  const fresh = stale.length > 0 ? sql`${suppliers.code} NOT IN (${sql.join(stale.map((c) => sql`${c}`), sql`, `)})` : sql`true`;
  // A fixed ₪ price (S16c) ÷ the rate, so × the rate gives it back (listUsd in src/domain/part-editor.ts).
  const list = sql`CASE WHEN ${variants.fixedIls} > 0 THEN ${variants.fixedIls} / ${rate.rate} ELSE ${variants.priceUsd} * coalesce(${variants.markup}, 1) END`;
  // Per family: how many option sets can be ordered, and the best offer.
  const shapeQuery = db
    .select({
      familyId: variants.familyId,
      sets: sql<number>`count(DISTINCT ${variants.familyOptions})::int`,
      availableSets: sql<number>`(count(DISTINCT ${variants.familyOptions}) FILTER (WHERE ${variants.available} IS TRUE))::int`,
      minList: sql<string | null>`min(${list})`,
      maxList: sql<string | null>`max(${list})`,
      freshMin: sql<string | null>`min(${list}) FILTER (WHERE ${fresh})`,
      freshMax: sql<string | null>`max(${list}) FILTER (WHERE ${fresh})`,
      available: sql<boolean | null>`bool_or(${variants.available})`,
      shipsLater: sql<boolean>`coalesce(bool_and(${variants.shipsLater}) FILTER (WHERE ${variants.available} IS TRUE), false)`,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(
      and(
        inArray(variants.familyId, ids),
        supplierCode ? eq(suppliers.code, supplierCode) : undefined,
        eq(products.status, "published"),
        isNull(products.missingSince),
        isNull(variants.missingSince),
        sql`${variants.priceUsd} > 0`,
      ),
    )
    .groupBy(variants.familyId);
  const [names, shape] = await Promise.all([supplierNames(), shapeQuery]);
  const byFamily = new Map(shape.map((r) => [r.familyId!, r]));
  const single = ids.filter((id) => byFamily.get(id)?.sets === 1);
  const only = new Map<string, CardVariant>();
  for (const { familyId, variant } of await variantsOf(single, rate, supplierCode)) if (!only.has(familyId)) only.set(familyId, variant);
  const vendor = supplierCode ? { code: supplierCode, name: names.get(supplierCode) ?? supplierCode } : undefined;

  return rows.map((r) => {
    const s = byFamily.get(r.id);
    // Every supplier on the card stale: no price at all; some: the range of the others.
    const codes = vendor ? [vendor.code] : r.supplierCodes;
    const none = allStale(codes, stale);
    const mixed = !vendor && someStale(codes, stale);
    const minUsd = none ? null : vendor ? s?.minList : mixed ? s?.freshMin : r.minListUsd;
    const maxUsd = none ? null : vendor ? s?.maxList : mixed ? s?.freshMax : r.maxListUsd;
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      image: r.images[0] ?? null,
      supplierNames: vendor ? [vendor.name] : r.supplierCodes.map((c) => names.get(c) ?? c),
      supplierCodes: codes,
      minPriceIls: priceIls(minUsd, rate, 1),
      maxPriceIls: priceIls(maxUsd, rate, 1),
      available: vendor ? (s?.available ?? null) : r.available,
      shipsLater: vendor ? (s?.shipsLater ?? false) : r.shipsLater,
      checkedAt: r.lastSeenAt.toISOString(),
      variantCount: r.variantCount,
      optionKeys: r.optionKeys,
      orderable: (s?.sets ?? 0) > 0,
      optionSets: s?.sets ?? 0,
      availableOptionSets: s?.availableSets ?? 0,
      onlyVariant: only.get(r.id) ?? null,
      ...(vendor ? { vendor } : {}),
    };
  });
}

/**
 * The filters as a cache key: only the fields a query reads, in a fixed order, so `page` and
 * `view` (and, for facets, `sort`) don't miss a cache that already holds the answer.
 */
function cacheKey(filters: CatalogFilters, keep: { sort?: boolean; supplier?: boolean } = {}): CatalogFilters {
  const specs = Object.fromEntries(Object.keys(filters.specs).sort().map((k) => [k, [...filters.specs[k]].sort()]));
  return {
    q: filters.q,
    category: filters.category,
    group: filters.group,
    supplier: keep.supplier === false ? "" : filters.supplier,
    program: filters.program,
    availableOnly: filters.availableOnly,
    sort: keep.sort ? filters.sort : "relevance",
    page: 1,
    specs,
    view: "grid",
  };
}

/** Plain browsing (a category, a vendor, a sort; no search or spec filter): few keys, every visitor's. */
function isBrowse(filters: CatalogFilters) {
  return !filters.q.trim() && Object.keys(filters.specs).length === 0;
}

/** A slice of the catalog as cards, from `offset`, with the number of families that match. */
export async function searchCards(filters: CatalogFilters, offset: number, limit: number) {
  const key = await resolvedKey(filters, { sort: true });
  return isBrowse(key) ? browseCards(key, offset, limit) : searchCardsLocal(key, offset, limit);
}

async function browseCards(filters: ResolvedFilters, offset: number, limit: number) {
  "use cache";
  catalogCache();
  return browseCardsShared(filters, offset, limit);
}

/** The shared (remote) entry behind browseCards's in-memory one. */
async function browseCardsShared(filters: ResolvedFilters, offset: number, limit: number) {
  "use cache: remote";
  catalogCache();
  return findCards(filters, offset, limit);
}

async function searchCardsLocal(filters: ResolvedFilters, offset: number, limit: number) {
  "use cache";
  catalogCache();
  return findCards(filters, offset, limit);
}

async function findCards(filters: ResolvedFilters, offset: number, limit: number) {
  const { where, order } = searchQuery(filters);

  // The match count rides along on each row (count(*) OVER () is taken before LIMIT).
  const found = await db
    .select({ ...cardColumns, total: sql<number>`(count(*) OVER ())::int` })
    .from(families)
    .leftJoin(categories, eq(categories.id, families.categoryId))
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
  // Past the last row no row carries it: count on its own (only a scroll past the end does this).
  const total =
    found[0]?.total ??
    (offset > 0
      ? (await db.select({ total: sql<number>`count(*)::int` }).from(families).leftJoin(categories, eq(categories.id, families.categoryId)).where(where))[0].total
      : 0);
  const cards = await toCards(found, filters.supplier || undefined);
  if (looksLikeSku(filters.q) && cards.length > 0) {
    const matched = await db
      .select({ familyId: variants.familyId, options: variants.familyOptions })
      .from(variants)
      .where(and(sql`${skuNorm} = ${normalizeSku(filters.q)}`, inArray(variants.familyId, cards.map((c) => c.id))));
    for (const m of matched) {
      const card = cards.find((c) => c.id === m.familyId);
      if (card && !card.skuPreset) card.skuPreset = m.options;
    }
  }
  return { cards, total };
}

/**
 * The search the catalog page runs: as typed, or with its typos fixed when that finds
 * more and the typed one finds fewer than 3 families ("beraing" → "bearing").
 */
export async function resolveSearch(q: string): Promise<string> {
  "use cache";
  catalogCache();
  if (!q.trim()) return q;
  const count = async (text: string) => {
    const match = textMatch(text);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(families).where(and(visible, match?.where));
    return n;
  };
  const strict = await count(q);
  if (strict >= FEW_HITS) return q;
  const fixed = await corrected(q);
  return fixed && (await count(fixed)) > strict ? fixed : q;
}

/** Sizes and specs to filter by, with how many families a tap on each value would show (0: none). */
export type SpecFacet = { key: string; values: { value: string; count: number }[] };

/** Keys shown first, in this order, when a list has them. */
const FACET_ORDER = ["dp", "module", "pitch", "teeth", "bore", "motor-fit", "width", "id", "od", "length", "cd", "material"];
const MAX_FACETS = 8;

/**
 * The spec filters worth offering for the current list: keys whose values
 * differ between families, the usual ones first. Which keys and values show is
 * worked out without the spec filters, so picking one bore doesn't hide the others;
 * each value's count is under the other chosen filters (see facetCountPlans).
 */
export async function getSpecFacets(filters: CatalogFilters): Promise<SpecFacet[]> {
  return specFacets(await resolvedKey(filters));
}

async function specFacets(filters: ResolvedFilters): Promise<SpecFacet[]> {
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
        unit: sql<string | null>`min(${sv.unit})`,
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

  // With spec filters chosen, count again: each key under the other keys' filters.
  const counts = new Map<string, number>();
  const id = (key: string, value: string) => `${key}\u0000${value}`;
  if (Object.keys(filters.specs).length > 0) {
    const counted = await Promise.all(
      facetCountPlans(filters.specs).map((plan) => {
        const ids = specVariants(plan.specs);
        const keys =
          "only" in plan.keys
            ? eq(sv.key, plan.keys.only)
            : plan.keys.except.length > 0
              ? sql`${sv.key} NOT IN (${sql.join(plan.keys.except.map((k) => sql`${k}`), sql`, `)})`
              : undefined;
        return db
          .select({ key: sv.key, value: sv.value, count: sql<number>`count(DISTINCT ${sv.familyId})::int` })
          .from(sv)
          .innerJoin(families, eq(families.id, sv.familyId))
          .leftJoin(categories, eq(categories.id, families.categoryId))
          .where(and(specRows, keys, ids ? sql`${sv.variantId} IN (${ids})` : undefined))
          .groupBy(sv.key, sv.value);
      }),
    );
    for (const r of counted.flat()) counts.set(id(r.key, r.value), r.count);
  } else for (const r of rows) counts.set(id(r.key, r.value), r.count);

  const byKey = new Map<string, { value: string; count: number; num: number | null }[]>();
  for (const r of rows) {
    // Sorted as numbers across units (1/8" before 4mm before 1/2"), CF1.
    const value = { value: r.value, count: counts.get(id(r.key, r.value)) ?? 0, num: sortValue(r.num === null ? null : Number(r.num), r.unit) };
    byKey.set(r.key, [...(byKey.get(r.key) ?? []), value]);
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
        // Every value, however many: CF2 shows long facets as a searchable list.
        .map(({ value, count }) => ({ value, count })),
    }));
}

/**
 * Suppliers that sell something in view (the category and search, any supplier), with how
 * many products each has there. The chosen supplier stays even when it has none.
 */
export async function getSupplierCounts(filters: CatalogFilters) {
  return supplierCounts(await resolvedKey(filters, { supplier: false }));
}

async function supplierCounts(filters: ResolvedFilters) {
  "use cache";
  catalogCache();
  const { where } = searchQuery(filters);
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
 * How many families of the current list each category holds, by slug: the search, vendor, program,
 * stock and spec filters, in any category (so the other categories can still be picked). The
 * category chips' numbers (audit C-07); a category missing here has none.
 */
export async function getCategoryCounts(filters: CatalogFilters): Promise<Record<string, number>> {
  // Not the category or the group: every category stays pickable, and each group chip keeps its own count.
  const key = cacheKey({ ...filters, category: "", group: "" });
  return isBrowse(key) ? categoryCountsBrowse(key) : categoryCountsLocal(key);
}

async function categoryCountsBrowse(filters: CatalogFilters) {
  "use cache";
  catalogCache();
  return categoryCountsShared(filters);
}

/** The shared (remote) entry behind categoryCountsBrowse's in-memory one. */
async function categoryCountsShared(filters: CatalogFilters) {
  "use cache: remote";
  catalogCache();
  return findCategoryCounts(filters);
}

async function categoryCountsLocal(filters: CatalogFilters) {
  "use cache";
  catalogCache();
  return findCategoryCounts(filters);
}

async function findCategoryCounts(filters: CatalogFilters): Promise<Record<string, number>> {
  const { where } = searchQuery(filters);
  const rows = await db
    .select({ slug: categories.slug, count: sql<number>`count(*)::int` })
    .from(families)
    .innerJoin(categories, eq(categories.id, families.categoryId))
    .where(where)
    .groupBy(categories.slug);
  return Object.fromEntries(rows.map((r) => [r.slug, r.count]));
}

/**
 * How many families customers can see: in all, per active vendor and per category. The single
 * source of every count on the site (src/domain/catalog-counts.ts); /catalog's own total is the
 * same set of rows, so with no filter they agree by construction.
 */
export async function getCatalogCounts(): Promise<CatalogCounts> {
  "use cache";
  catalogCache();
  return catalogCountsShared();
}

/** The shared (remote) entry behind getCatalogCounts's in-memory one. */
async function catalogCountsShared(): Promise<CatalogCounts> {
  "use cache: remote";
  catalogCache();
  const [rows, active] = await Promise.all([
    db.select({ supplierCodes: families.supplierCodes, categoryId: families.categoryId }).from(families).where(visible),
    db.select({ code: suppliers.code }).from(suppliers).where(eq(suppliers.active, true)),
  ]);
  return tallyFamilies(rows, active.map((s) => s.code));
}

/**
 * Categories and suppliers that have something to show, with family counts. Each category
 * also carries up to three photos of its main items (motors, not the screws filed next to them).
 */
export async function getFacets() {
  "use cache";
  catalogCache();
  return facetsShared();
}

/** The shared (remote) entry behind getFacets's in-memory one. */
async function facetsShared() {
  "use cache: remote";
  catalogCache();

  // The admin's home photo (S16d) leads the regroup's own picks.
  const images = sql<string[]>`CASE WHEN ${categories.homeImage} IS NULL THEN ${categories.images}
    ELSE (array_prepend(${categories.homeImage}, array_remove(${categories.images}, ${categories.homeImage})))[1:3] END`;
  const categoryQuery = db
    .select({ id: categories.id, slug: categories.slug, name: categories.name, group: categories.groupId, images })
    .from(categories)
    .where(eq(categories.hidden, false))
    .orderBy(asc(categories.sortOrder));
  const supplierQuery = db
    .select({ code: suppliers.code, name: suppliers.name, programs: suppliers.programs, logoUrl: suppliers.logoUrl, accentColor: suppliers.accentColor, accentColor2: suppliers.accentColor2 })
    .from(suppliers)
    .where(eq(suppliers.active, true));
  const [categoryRows, supplierRows, counts] = await Promise.all([categoryQuery, supplierQuery, getCatalogCounts()]);

  return {
    // Only what has something to show; the numbers are the shared ones.
    categories: categoryRows.flatMap(({ id, ...c }) => (counts.categories[id] ? [{ ...c, count: counts.categories[id] }] : [])),
    suppliers: supplierRows.flatMap((s) => (counts.vendors[s.code] ? [{ ...s, count: counts.vendors[s.code] }] : [])).sort((a, b) => b.count - a.count),
  };
}

/** A family with every listed variant, from every supplier that sells it. */
export async function getFamily(slug: string) {
  "use cache";
  catalogCache();
  return familyShared(slug);
}

/** The shared (remote) entry behind getFamily's in-memory one. */
async function familyShared(slug: string) {
  "use cache: remote";
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
      markup: variants.markup,
      fixedIls: variants.fixedIls,
      available: variants.available,
      shipsLater: variants.shipsLater,
      shipsLaterEta: variants.shipsLaterEta,
      checkedAt: variants.checkedAt,
      productId: products.id,
      productTitle: products.title,
      productUrl: products.url,
      image: sql<string | null>`${products.images}[1]`,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(sql`${variants.familyId} = ${row.family.id} AND ${products.status} = 'published' AND ${products.missingSince} IS NULL AND ${variants.missingSince} IS NULL`)
    .orderBy(asc(products.title), asc(variants.position));

  const [descriptionRows, specRows] = await Promise.all([
    // Each product's description once, not once per size: a 40-size gear line repeated it 40 times.
    db
      .selectDistinct({ id: products.id, html: products.descriptionHtml })
      .from(products)
      .innerJoin(variants, eq(variants.productId, products.id))
      .where(sql`${variants.familyId} = ${row.family.id} AND ${products.status} = 'published' AND ${products.missingSince} IS NULL AND ${variants.missingSince} IS NULL`),
    db
      .select({ variantId: schema.specValues.variantId, key: schema.specValues.key, value: schema.specValues.value })
      .from(schema.specValues)
      .where(eq(schema.specValues.familyId, row.family.id)),
  ]);
  const specs: Record<string, { key: string; value: string }[]> = {};
  for (const r of specRows) if (r.variantId) (specs[r.variantId] ??= []).push({ key: r.key, value: r.value });

  // The description rides on each product's first variant only (null on its other sizes), so the
  // cached entry holds it once.
  const description = new Map(descriptionRows.map((d) => [d.id, d.html]));
  const seen = new Set<string>();
  const withDescriptions = familyVariants.map(({ productId, ...v }) => {
    const first = !seen.has(productId);
    seen.add(productId);
    return { ...v, productDescription: first ? (description.get(productId) ?? null) : null };
  });

  return { ...row, variants: withDescriptions, specs };
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
    /** With the SKU, so a SKU two vendors share opens on this vendor's offer. */
    vendor: supplierCode,
  };
}

/** Variants a team can add: listed, published, with a price. */
const orderable = sql`${memberVariant} AND ${variants.priceUsd} > 0`;

/**
 * Every word of 3+ letters in a visible family title, with how many families use it,
 * for correcting typos ("krakn" → "kraken"). Changes only at sync.
 */
async function titleVocabulary(): Promise<[string, number][]> {
  "use cache";
  catalogCache();
  const rows = await db.execute<{ word: string; n: number }>(sql`
    SELECT word, count(*)::int AS n
    FROM ${families}, regexp_split_to_table(lower(${families.title}), '[^a-z0-9]+') AS word
    WHERE ${families.status} = 'published' AND ${families.missingSince} IS NULL AND length(word) >= 3 AND word ~ '^[a-z]+$'
    GROUP BY word`);
  return rows.rows.map((r) => [r.word, r.n]);
}

/** The search with its typos fixed, when the catalog knows a close word, else null. */
async function corrected(q: string): Promise<string | null> {
  return correctQuery(q, new Map(await titleVocabulary()));
}

/** Fewer hits than this, and a search with a typo fixed is tried as well. */
const FEW_HITS = 3;

/**
 * The few best matches for the search panel. When a family is a single part (one
 * SKU, even if several suppliers sell it), it carries the variant to add: the
 * cheapest one in stock. A search that is a SKU carries that exact variant
 * (`matchedVariant`), in any family. With fewer than 3 hits, a typo-fixed search
 * ("krakn x60" → "kraken x60") is used when it finds more; `query` says what ran.
 */
export async function quickSearch(q: string, supplier = "") {
  "use cache";
  catalogCache();
  const [first, names] = await Promise.all([quickRows(q, supplier), supplierNames()]);
  let rows = first;
  let query = q;
  if (rows.length < FEW_HITS) {
    const fixed = await corrected(q);
    const more = fixed ? await quickRows(fixed, supplier) : [];
    if (fixed && more.length > rows.length) {
      rows = more;
      query = fixed;
    }
  }
  return { query, rows: rows.map((r) => ({ ...r, supplierNames: r.supplierCodes.map((c) => names.get(c) ?? c) })) };
}

/** `supplier`: only that vendor's families (a vendor store's search box). */
async function quickRows(q: string, supplier = "") {
  const filters: CatalogFilters = { q, category: "", group: "", supplier, program: "", availableOnly: false, sort: "relevance", page: 1, specs: {}, view: "grid" };
  const { where, order } = searchQuery(filters);
  const part = sql`coalesce(upper(${variants.supplierSku}), ${variants.id}::text)`;
  const fromFamily = sql`FROM ${variants} JOIN ${products} ON ${products.id} = ${variants.productId} WHERE ${orderable}`;
  const sku = looksLikeSku(q) ? normalizeSku(q) : null;

  return db
    .select({
      id: families.id,
      slug: families.slug,
      title: families.title,
      image: sql<string | null>`${families.images}[1]`,
      minListUsd: families.minListUsd,
      maxListUsd: families.maxListUsd,
      available: families.available,
      shipsLater: families.shipsLater,
      optionKeys: families.optionKeys,
      lastSeenAt: families.lastSeenAt,
      supplierCodes: families.supplierCodes,
      variantCount: sql<number>`(SELECT count(DISTINCT ${part})::int ${fromFamily})`,
      onlyVariant: sql<{ id: string; sku: string | null } | null>`(
        SELECT CASE WHEN count(DISTINCT ${part}) = 1 THEN
          (array_agg(json_build_object('id', ${variants.id}, 'sku', ${variants.supplierSku})
            ORDER BY ${variants.available} IS TRUE DESC, ${variants.priceUsd} ASC))[1]
        END ${fromFamily})`,
      matchedVariant: sku
        ? sql<{ id: string; sku: string; priceUsd: string; markup: string | null; fixedIls: string | null; supplierCode: string } | null>`(
          SELECT json_build_object('id', ${variants.id}, 'sku', ${variants.supplierSku}, 'priceUsd', ${variants.priceUsd}, 'markup', ${variants.markup}, 'fixedIls', ${variants.fixedIls}, 'supplierCode', (SELECT ${suppliers.code} FROM ${suppliers} WHERE ${suppliers.id} = ${variants.supplierId}))
          ${fromFamily} AND ${skuNorm} = ${sku}
          ORDER BY ${variants.available} IS TRUE DESC, ${variants.priceUsd} ASC LIMIT 1)`
        : sql<null>`NULL`,
    })
    .from(families)
    .leftJoin(categories, eq(categories.id, families.categoryId))
    .where(where)
    .orderBy(...order)
    .limit(8);
}

export type QuickResult = Awaited<ReturnType<typeof quickSearch>>["rows"][number];

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
  const rate = await priceContext();
  const rows = await db
    .select({
      variantId: variants.id,
      sku: variants.supplierSku,
      options: variants.familyOptions,
      priceUsd: variants.priceUsd,
      markup: variants.markup,
      fixedIls: variants.fixedIls,
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
    // The id, not the SKU: two vendors can share a SKU, and a cart line is one offer.
    href: r.familySlug ? familyHref(r.familySlug, r.variantId) : "/catalog",
    supplierName: r.supplierName,
    unitPriceIls: priceIls(r.priceUsd, rate, r.markup, r.fixedIls),
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

/**
 * "התכוונתם ל…" when a search finds nothing: up to 3 family titles whose words are
 * closest to it (trigram word similarity), English or the Hebrew word's synonym.
 */
export async function searchSuggestions(q: string): Promise<string[]> {
  "use cache";
  catalogCache();
  const english = englishQuery(q) || (/[a-z0-9]/i.test(q) ? q : "");
  if (english.length < 3) return [];
  const rows = await db
    .select({ title: families.title, score: sql<number>`extensions.word_similarity(${english}, ${families.title})` })
    .from(families)
    .where(and(visible, sql`extensions.word_similarity(${english}, ${families.title}) > 0.35`))
    .orderBy(sql`extensions.word_similarity(${english}, ${families.title}) DESC`, asc(families.title))
    .limit(12);
  // One suggestion per product: "Electronic Bundles Builder - Processor:…" lists each option set as a family.
  return [...new Set(rows.map((r) => r.title.replace(/ - .*$/, "")))].slice(0, 3);
}

/**
 * One row of popularity signals per family this vendor sells (src/domain/popular.ts): its pins and
 * best-seller rank on this vendor's products, this vendor's orders in the last 12 months, and its
 * stock and lowest list price at this vendor.
 */
async function vendorSignals(code: string): Promise<FamilySignals[]> {
  "use cache";
  catalogCache();
  const rows = await db.execute<{
    id: string;
    pin: number | null;
    best: number | null;
    teams: number;
    qty: number;
    available: boolean;
    accessory: boolean;
    has_image: boolean;
    price: string | null;
  }>(sql`
    WITH vv AS (
      SELECT v.id, v.family_id, v.available, v.price_usd * coalesce(v.markup, 1) AS list, p.best_seller_rank, po.pin_rank
      FROM variants v
      JOIN products p ON p.id = v.product_id
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN product_overrides po ON po.product_id = p.id
      WHERE s.code = ${code} AND p.status = 'published' AND p.missing_since IS NULL AND v.missing_since IS NULL AND v.family_id IS NOT NULL
    ),
    fam AS (
      SELECT family_id, min(pin_rank) AS pin, min(best_seller_rank) AS best, bool_or(available IS TRUE) AS available,
        min(list) FILTER (WHERE list > 0) AS price
      FROM vv GROUP BY family_id
    ),
    ord AS (
      SELECT vv.family_id, count(DISTINCT o.team_id)::int AS teams, sum(i.qty)::int AS qty
      FROM team_order_items i
      JOIN team_orders o ON o.id = i.order_id
      JOIN vv ON vv.id = i.variant_id
      WHERE o.status <> 'cancelled' AND o.submitted_at > now() - interval '365 days'
      GROUP BY vv.family_id
    )
    SELECT f.id, fam.pin, fam.best, coalesce(ord.teams, 0) AS teams, coalesce(ord.qty, 0) AS qty, fam.available,
      (f.title ~* ${ACCESSORY_TITLE_PATTERN} AND coalesce(c.slug, '') NOT IN (${sql.join(HARDWARE_CATEGORIES.map((h) => sql`${h}`), sql`, `)})) AS accessory,
      cardinality(f.images) > 0 AS has_image, fam.price::text AS price
    FROM fam
    JOIN ${families} f ON f.id = fam.family_id
    LEFT JOIN ${categories} c ON c.id = f.category_id
    LEFT JOIN ord ON ord.family_id = fam.family_id
    WHERE f.status = 'published' AND f.missing_since IS NULL`);
  return rows.rows.map((r) => ({
    id: r.id,
    pinRank: r.pin,
    bestSellerRank: r.best,
    teams: r.teams,
    qty: r.qty,
    available: r.available,
    accessory: r.accessory,
    hasImage: r.has_image,
    priceUsd: r.price === null ? null : Number(r.price),
  }));
}

/** Card rows for these families, in the given order. */
async function cardRows(ids: string[]): Promise<CardRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.select(cardColumns).from(families).where(inArray(families.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/** The vendor's most wanted families, best first (src/domain/popular.ts). */
async function vendorPopularRows(code: string, limit: number): Promise<CardRow[]> {
  return cardRows(rankPopular(await vendorSignals(code), limit));
}

/** Today in Israel (YYYY-MM-DD): the discovery strip's seed. Read when the cache fills, so it moves with the daily sync. */
function israelDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

/** Cards per "גלו עוד" page: what the strip loads at a time. */
export const DISCOVER_PAGE = 10;

/**
 * Today's whole "גלו עוד" pool, in strip order: one vendor's eligible picks (`vendor` = its code),
 * or every vendor's taking turns (`vendor` = ""). Shuffled by day, so it's stable and cacheable.
 */
async function discoveryPool(vendor: string): Promise<{ id: string; code: string }[]> {
  "use cache: remote";
  catalogCache();
  const one = async (code: string) => {
    const signals = await vendorSignals(code);
    return pickDiscovery(signals, rankPopular(signals, POPULAR_COUNT), `${israelDay()}:${code}`, signals.length).map((id) => ({ id, code }));
  };
  if (vendor) return one(vendor);
  const { suppliers: vendors } = await getFacets();
  const lists = await Promise.all(vendors.map((v) => one(v.code)));
  return interleave(lists, (x) => x.id);
}

/**
 * One page of the endless "גלו עוד" strip (any integer; it wraps around both ways, so a part
 * repeats only after the whole pool), each card with its own vendor's price and offer.
 */
export async function getDiscoveryPage(vendor: string, page: number): Promise<{ cards: CardFamily[]; pages: number }> {
  "use cache";
  catalogCache();
  const pool = await discoveryPool(vendor);
  const slice = wrappedPage(pool, page, DISCOVER_PAGE);
  const codes = [...new Set(slice.map((x) => x.code))];
  const cards = (
    await Promise.all(codes.map(async (code) => toCards(await cardRows(slice.filter((x) => x.code === code).map((x) => x.id)), code)))
  ).flat();
  const at = (c: CardFamily) => slice.findIndex((x) => x.id === c.id && x.code === c.vendor?.code);
  return { cards: cards.sort((x, y) => at(x) - at(y)), pages: pageCount(pool.length, DISCOVER_PAGE) };
}

/** How many families "הכי מבוקשים" shows. */
export const POPULAR_COUNT = 8;

/** The top of a vendor's store: its most wanted families as cards, with this vendor's prices. */
export async function getVendorPopular(code: string, limit = POPULAR_COUNT): Promise<CardFamily[]> {
  "use cache";
  catalogCache();
  return vendorPopularShared(code, limit);
}

/** The shared (remote) entry behind getVendorPopular's in-memory one. */
async function vendorPopularShared(code: string, limit: number): Promise<CardFamily[]> {
  "use cache: remote";
  catalogCache();
  return toCards(await vendorPopularRows(code, limit), code);
}

export type VendorSummary = {
  code: string;
  name: string;
  count: number;
  images: string[];
  logoUrl: string | null;
  accentColor: string | null;
  accentColor2: string | null;
  /** Its biggest categories, by name, for the line under its name. */
  categories: { name: string; count: number }[];
};

/**
 * The home page's vendor boxes: every active vendor with something published (from the
 * `suppliers` table, so a vendor added in the admin shows up by itself), with its family count,
 * logo, accent, biggest categories and photos of its 3 most wanted.
 */
export async function getVendors(): Promise<VendorSummary[]> {
  "use cache";
  catalogCache();
  return vendorsShared();
}

/** The shared (remote) entry behind getVendors's in-memory one. */
async function vendorsShared(): Promise<VendorSummary[]> {
  "use cache: remote";
  catalogCache();
  const byCategoryQuery = db
    .select({ code: suppliers.code, name: categories.name, count: sql<number>`count(DISTINCT ${families.id})::int` })
    .from(families)
    .innerJoin(categories, eq(categories.id, families.categoryId))
    .innerJoin(suppliers, sql`${suppliers.code} = ANY(${families.supplierCodes})`)
    // "שונות" says nothing about a vendor, so the line under its name leaves it out.
    .where(and(visible, eq(suppliers.active, true), sql`${categories.slug} <> 'other'`))
    .groupBy(suppliers.code, categories.name);
  const [{ suppliers: rows }, byCategory] = await Promise.all([getFacets(), byCategoryQuery]);
  // All vendors at once: the pool (5 connections, src/db/index.ts) queues the rest, and with the
  // remote cache this runs about once per region per catalog change, not on every new instance.
  // Six: a box that spans a whole row shows them all (vendor-boxes.tsx).
  const tops = await Promise.all(rows.map((s) => vendorPopularRows(s.code, 6)));
  return rows.map((s, i) => ({
    code: s.code,
    name: s.name,
    count: s.count,
    logoUrl: s.logoUrl,
    accentColor: s.accentColor,
    accentColor2: s.accentColor2,
    categories: byCategory.filter((c) => c.code === s.code).map((c) => ({ name: c.name, count: c.count })),
    images: tops[i].flatMap((r) => (r.images[0] ? [r.images[0]] : [])),
  }));
}

/**
 * A vendor's store: the vendor, its family count, and its categories with how many of its
 * families each holds and the photo of the best-ranked one. Null for an unknown or inactive vendor.
 */
export async function getVendorStore(code: string) {
  "use cache";
  catalogCache();
  return vendorStoreShared(code);
}

/** The shared (remote) entry behind getVendorStore's in-memory one. */
async function vendorStoreShared(code: string) {
  "use cache: remote";
  catalogCache();
  const ofVendor = and(visible, sql`${code} = ANY(${families.supplierCodes})`);
  // All three at once; an unknown vendor's other two just find nothing.
  const vendorQuery = db
    .select({ code: suppliers.code, name: suppliers.name, baseUrl: suppliers.baseUrl, logoUrl: suppliers.logoUrl, accentColor: suppliers.accentColor, accentColor2: suppliers.accentColor2 })
    .from(suppliers)
    .where(and(eq(suppliers.code, code), eq(suppliers.active, true)))
    .limit(1);
  const countsQuery = db
    .select({ slug: categories.slug, name: categories.name, group: categories.groupId, sortOrder: categories.sortOrder, count: sql<number>`count(*)::int` })
    .from(families)
    .innerJoin(categories, eq(categories.id, families.categoryId))
    .where(and(ofVendor, eq(categories.hidden, false)))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder));
  const photosQuery = db.execute<{ slug: string; image: string }>(sql`
    SELECT DISTINCT ON (c.slug) c.slug AS slug, ${families.images}[1] AS image
    FROM ${families} JOIN ${categories} c ON c.id = ${families.categoryId}
    WHERE ${ofVendor} AND cardinality(${families.images}) > 0
    ORDER BY c.slug, ${families.pinnedRank} ASC NULLS LAST, ${families.available} IS TRUE DESC,
      (coalesce(${families.minPriceUsd}, 0) >= ${MAIN_ITEM_MIN_USD}) DESC, ${families.variantCount} DESC`);
  const [[vendor], counts, photos, shared] = await Promise.all([vendorQuery, countsQuery, photosQuery, getCatalogCounts()]);
  if (!vendor) return null;
  const image = new Map(photos.rows.map((r) => [r.slug, r.image]));
  return {
    ...vendor,
    // The same number the home page's vendor box shows; the categories below can add up to less
    // (a hidden category or a family with none).
    count: shared.vendors[code] ?? 0,
    categories: counts.map((c) => ({ slug: c.slug, name: c.name, group: c.group, count: c.count, images: image.has(c.slug) ? [image.get(c.slug)!] : [] })),
  };
}
