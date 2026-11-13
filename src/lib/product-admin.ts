import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { optionNames, partBadges, type PartSource, type VariantOption } from "@/domain/part-editor";
import { priceIls } from "@/domain/pricing";
import { priceContext } from "./settings";

/** מוצרים (S16c): what /admin/settings/products lists and edits. */

export const PAGE_SIZE = 60;

export type ProductCard = {
  id: string;
  title: string;
  image: string | null;
  minIls: number | null;
  maxIls: number | null;
  available: boolean | null;
  variantCount: number;
  badges: ReturnType<typeof partBadges>;
};

export type ProductFilter = { supplierId: string; q: string; categoryId: string; showHidden: boolean; onlyEdited: boolean; page: number };

/** One supplier's parts as the catalog shows them (overrides applied), newest custom parts first, then by name. */
export async function productCards(f: ProductFilter): Promise<{ cards: ProductCard[]; total: number }> {
  const ctx = await priceContext();
  const q = f.q.trim().toLowerCase();
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db.execute<{
    id: string;
    title: string;
    image: string | null;
    source: PartSource;
    hidden: boolean;
    manual_price: boolean;
    min_list: string | null;
    max_list: string | null;
    available: boolean | null;
    variants: number;
    total: number;
  }>(sql`
    WITH parts AS (
      SELECT p.id, p.title, p.images[1] AS image, p.source, p.created_at,
             (coalesce(o.hidden, false) OR p.status = 'hidden') AS hidden,
             coalesce(o.category_id, p.category_id) AS category_id, p.search_text,
             (o.product_id IS NOT NULL OR EXISTS (SELECT 1 FROM variants v JOIN variant_overrides vo ON vo.variant_id = v.id WHERE v.product_id = p.id)) AS edited
        FROM products p LEFT JOIN product_overrides o ON o.product_id = p.id
       WHERE p.supplier_id = ${f.supplierId} AND p.missing_since IS NULL
    )
    SELECT parts.id, parts.title, parts.image, parts.source, parts.hidden,
           EXISTS (SELECT 1 FROM variants v JOIN variant_overrides vo ON vo.variant_id = v.id
                    WHERE v.product_id = parts.id AND (vo.price_usd IS NOT NULL OR vo.fixed_ils IS NOT NULL)) AS manual_price,
           s.min_list, s.max_list, s.available, coalesce(s.variants, 0)::int AS variants,
           count(*) OVER ()::int AS total
      FROM parts
      LEFT JOIN LATERAL (
        SELECT min(l)::text AS min_list, max(l)::text AS max_list, bool_or(v.available) AS available, count(*) AS variants
          FROM variants v
          LEFT JOIN variant_overrides vo ON vo.variant_id = v.id,
          LATERAL (SELECT CASE WHEN v.fixed_ils > 0 THEN v.fixed_ils / ${ctx.rate} WHEN v.price_usd > 0 THEN v.price_usd * coalesce(v.markup, ${ctx.markup}) END AS l) list
         WHERE v.product_id = parts.id AND v.missing_since IS NULL AND vo.hidden IS NOT TRUE
      ) s ON true
     WHERE (${f.showHidden} OR NOT parts.hidden)
       AND (NOT ${f.onlyEdited} OR parts.edited)
       AND (${f.categoryId} = '' OR parts.category_id::text = ${f.categoryId})
       AND (${q} = '' OR lower(parts.title) LIKE ${like} OR parts.search_text LIKE ${like})
     ORDER BY (parts.source = 'custom') DESC, parts.title
     LIMIT ${PAGE_SIZE} OFFSET ${f.page * PAGE_SIZE}`);
  return {
    total: rows.rows[0]?.total ?? 0,
    cards: rows.rows.map((r) => ({
      id: r.id,
      title: r.title,
      image: r.image,
      minIls: priceIls(r.min_list, ctx, 1),
      maxIls: priceIls(r.max_list, ctx, 1),
      available: r.available,
      variantCount: r.variants,
      badges: partBadges({ hidden: r.hidden, source: r.source, manualPrice: r.manual_price }),
    })),
  };
}

export type EditorVariant = {
  id: string;
  options: VariantOption[];
  sku: string | null;
  /** The admin's USD price, or null for the store's. For a custom part, its own price. */
  priceUsd: string | null;
  storePriceUsd: string | null;
  storeSku: string | null;
  fixedIls: string | null;
  hidden: boolean;
  overridden: boolean;
  priceIls: number | null;
};

export type EditorPart = {
  id: string;
  supplierId: string;
  source: PartSource;
  url: string;
  title: string;
  storeTitle: string;
  descriptionHtml: string | null;
  storeDescriptionHtml: string | null;
  images: string[];
  storeImages: string[];
  categoryId: string | null;
  storeCategoryId: string | null;
  available: boolean | null;
  hidden: boolean;
  overridden: boolean;
  optionNames: string[];
  variants: EditorVariant[];
  orderLines: number;
  /** Family controls (S15, folded in here): its own family, or one merged with others. */
  alone: boolean;
  mergeKey: string | null;
  family: { slug: string; title: string; members: { title: string; supplier: string }[] } | null;
};

/** One part with its store values and the admin's, for the edit window. */
export async function editorPart(id: string): Promise<EditorPart | null> {
  const [p] = await db
    .select({ product: schema.products, override: schema.productOverrides })
    .from(schema.products)
    .leftJoin(schema.productOverrides, eq(schema.productOverrides.productId, schema.products.id))
    .where(eq(schema.products.id, id));
  if (!p) return null;
  const ctx = await priceContext();
  const vs = await db
    .select({ v: schema.variants, o: schema.variantOverrides })
    .from(schema.variants)
    .leftJoin(schema.variantOverrides, eq(schema.variantOverrides.variantId, schema.variants.id))
    .where(sql`${schema.variants.productId} = ${id} AND ${schema.variants.missingSince} IS NULL`)
    .orderBy(asc(schema.variants.position));
  const [orderLines, family] = await Promise.all([orderLineCount(vs.map((r) => r.v.id)), familyOf(id)]);
  const { product, override: o } = p;
  const custom = product.source === "custom";
  const variants: EditorVariant[] = vs.map(({ v, o: vo }) => ({
    id: v.id,
    options: v.options,
    sku: v.supplierSku,
    priceUsd: custom ? v.supplierPriceUsd : (vo?.priceUsd ?? null),
    storePriceUsd: v.supplierPriceUsd,
    storeSku: v.storeSku,
    fixedIls: vo?.fixedIls ?? null,
    hidden: vo?.hidden ?? false,
    overridden: !custom && !!vo && (vo.priceUsd !== null || vo.sku !== null || vo.options !== null || vo.fixedIls !== null),
    priceIls: priceIls(v.priceUsd, ctx, v.markup, v.fixedIls),
  }));
  return {
    id: product.id,
    supplierId: product.supplierId,
    source: product.source,
    url: product.url,
    title: product.title,
    storeTitle: product.storeTitle ?? product.title,
    descriptionHtml: product.descriptionHtml,
    storeDescriptionHtml: product.storeDescriptionHtml,
    images: product.images,
    storeImages: product.storeImages ?? product.images,
    categoryId: o?.categoryId ?? product.categoryId,
    storeCategoryId: product.categoryId,
    available: o?.available ?? null,
    hidden: (o?.hidden ?? false) || product.status === "hidden",
    overridden: !custom && !!o && (o.title !== null || o.descriptionHtml !== null || o.images !== null || o.available !== null || o.categoryId !== null),
    optionNames: optionNames(vs.map((r) => r.v)),
    variants,
    orderLines,
    alone: o?.alone ?? false,
    mergeKey: o?.mergeKey ?? null,
    family,
  };
}

/** Order lines and supplier-order lines that point at these variants: while there are any, nothing is deleted. */
export async function orderLineCount(variantIds: string[]): Promise<number> {
  if (!variantIds.length) return 0;
  const [items] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.teamOrderItems).where(inArray(schema.teamOrderItems.variantId, variantIds));
  const [lines] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.poLines).where(inArray(schema.poLines.variantId, variantIds));
  return items.n + lines.n;
}

export type SupplierChoice = { id: string; code: string; name: string; platform: string; active: boolean; parts: number };

export async function supplierChoices(): Promise<SupplierChoice[]> {
  const rows = await db.execute<SupplierChoice>(sql`
    SELECT s.id, s.code, s.name, s.platform::text AS platform, s.active,
           (SELECT count(*)::int FROM products p WHERE p.supplier_id = s.id AND p.missing_since IS NULL) AS parts
      FROM suppliers s ORDER BY s.active DESC, s.name`);
  return rows.rows;
}

export async function categoryChoices() {
  return db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
}

/** The family a product's variants are in, with the other products in it. */
async function familyOf(productId: string): Promise<EditorPart["family"]> {
  const { rows } = await db.execute<{ slug: string; family_title: string; title: string; supplier: string; self: boolean }>(sql`
    WITH fam AS (SELECT family_id FROM variants WHERE product_id = ${productId} AND family_id IS NOT NULL LIMIT 1)
    SELECT DISTINCT f.slug, f.title AS family_title, p.title, s.name AS supplier, p.id = ${productId} AS self
      FROM fam JOIN product_families f ON f.id = fam.family_id
      JOIN variants v ON v.family_id = f.id JOIN products p ON p.id = v.product_id JOIN suppliers s ON s.id = p.supplier_id`);
  if (!rows.length) return null;
  return { slug: rows[0].slug, title: rows[0].family_title, members: rows.filter((r) => !r.self).map((r) => ({ title: r.title, supplier: r.supplier })) };
}

/**
 * What to merge into: a family's slug (or its page link) or a SKU in it. Uses the
 * family's merge key when it has one, else its slug, on its primary product.
 */
export async function mergeTarget(text: string): Promise<{ primaryProductId: string; mergeKey: string } | null> {
  const slug = text.replace(/^.*\/catalog\/p\//, "").replace(/[?#].*$/, "");
  const { rows } = await db.execute<{ primary_product_id: string | null; slug: string; merge_key: string | null }>(sql`
    SELECT f.slug, f.primary_product_id, o.merge_key
      FROM product_families f
      LEFT JOIN product_overrides o ON o.product_id = f.primary_product_id
     WHERE f.missing_since IS NULL
       AND (f.slug = ${slug} OR f.id IN (SELECT family_id FROM variants WHERE upper(supplier_sku) = upper(${text})))
     LIMIT 1`);
  const row = rows[0];
  if (!row?.primary_product_id) return null;
  return { primaryProductId: row.primary_product_id, mergeKey: row.merge_key ?? row.slug };
}

/** Where a family is edited now: its primary product's sheet in /admin/settings/products. */
export async function familyEditHref(slugOrText: string): Promise<string | null> {
  const target = await mergeTarget(slugOrText);
  if (!target) return null;
  const [row] = await db
    .select({ code: schema.suppliers.code })
    .from(schema.products)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.products.supplierId))
    .where(eq(schema.products.id, target.primaryProductId));
  return row ? `/admin/settings/products?s=${encodeURIComponent(row.code)}&edit=${target.primaryProductId}` : null;
}
