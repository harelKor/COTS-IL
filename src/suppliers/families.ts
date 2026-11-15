import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";
import { applyProductOverrides, familyPinRank, type ProductOverride } from "../domain/catalog-overrides";
import { listUsd } from "../domain/part-editor";
import { categoryPhotos } from "../domain/catalog-rank";
import { resolveMarkup, type PricingRuleSet } from "../domain/pricing";
import { parseSettings } from "../domain/settings";
import { groupFamilies, type FamilyDraft, type GroupProduct } from "../domain/families/group";
import { isRealDescription } from "../lib/description";

/** Any driver's transaction: the sync and `npm run regroup` use postgres.js, the admin's actions node-postgres. */
type Tx = PgDatabase<PgQueryResultHKT, typeof schema>;

const BATCH = 500;

function chunks<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type RegroupCounts = {
  families: number;
  byGrouping: Record<string, number>;
  /** Per supplier: listed variants (SKUs) and the families they ended up in. */
  bySupplier: Record<string, { variants: number; families: number }>;
  multiSupplierFamilies: number;
  issues: Record<string, number>;
};

/**
 * Rebuilds product families from the whole catalog, inside the caller's
 * transaction. Runs after every supplier sync, because a family can span
 * suppliers, and on its own with `npm run regroup`.
 */
export async function regroupCatalog(tx: Tx): Promise<RegroupCounts> {
  const now = new Date();
  const { products, variants, suppliers, categories } = schema;

  await applyOverrides(tx);
  await applyPricingRules(tx);
  const overrides = await loadOverrides(tx);
  const rate = await loadRate(tx);

  const productRows = await tx
    .select({
      id: products.id,
      supplierCode: suppliers.code,
      supplierName: suppliers.name,
      title: products.title,
      categorySlug: categories.slug,
      descriptionHtml: products.descriptionHtml,
      images: products.images,
      programs: products.programs,
      status: products.status,
    })
    .from(products)
    .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(isNull(products.missingSince), eq(suppliers.active, true), notInArray(products.status, ["hidden"])));

  const variantRows = await tx
    .select({
      id: variants.id,
      productId: variants.productId,
      sku: variants.supplierSku,
      options: variants.options,
      priceUsd: variants.priceUsd,
      markup: variants.markup,
      fixedIls: variants.fixedIls,
      available: variants.available,
      shipsLater: variants.shipsLater,
    })
    .from(variants)
    // A variant the admin hid (S16c) joins no family, so the catalog doesn't list it.
    .leftJoin(schema.variantOverrides, eq(schema.variantOverrides.variantId, variants.id))
    .where(and(isNull(variants.missingSince), sql`${schema.variantOverrides.hidden} IS NOT TRUE`))
    .orderBy(variants.position);

  const variantsByProduct = new Map<string, typeof variantRows>();
  for (const v of variantRows) variantsByProduct.set(v.productId, [...(variantsByProduct.get(v.productId) ?? []), v]);
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const input = applyProductOverrides(
    productRows
      .filter((p) => variantsByProduct.has(p.id))
      .map((p) => ({
        id: p.id,
        supplierCode: p.supplierCode,
        title: p.title,
        categorySlug: p.categorySlug,
        descriptionHtml: p.descriptionHtml,
        images: p.images,
        variants: variantsByProduct.get(p.id)!.map((v) => ({ id: v.id, sku: v.sku, options: v.options, priceUsd: v.priceUsd === null ? null : Number(v.priceUsd) })),
      })),
    overrides,
  );
  // The family takes its photos from the products as the admin left them.
  for (const p of input) productById.get(p.id)!.images = p.images;

  const { families, issues } = groupFamilies(input satisfies GroupProduct[]);
  const categoryIds = new Map((await tx.select().from(categories)).map((c) => [c.slug, c.id]));

  const variantById = new Map(variantRows.map((v) => [v.id, v]));
  const familyValues = families.map((f) => ({
    ...familyRow(f, productById, variantById, categoryIds, now, rate),
    pinnedRank: familyPinRank(f.productIds, overrides),
  }));

  // Slugs move between families when titles change, so free them all first.
  await tx.update(schema.productFamilies).set({ slug: sql`'old-' || ${schema.productFamilies.id}` });

  const idByKey = new Map<string, string>();
  for (const batch of chunks(familyValues)) {
    const saved = await tx
      .insert(schema.productFamilies)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.productFamilies.key,
        set: Object.fromEntries(
          Object.keys(batch[0])
            .filter((k) => k !== "key")
            .map((k) => [k, sql.raw(`excluded.${toColumn(k)}`)]),
        ),
      })
      .returning({ id: schema.productFamilies.id, key: schema.productFamilies.key });
    for (const row of saved) idByKey.set(row.key, row.id);
  }

  const liveIds = [...idByKey.values()];
  await tx
    .update(schema.productFamilies)
    .set({ missingSince: now })
    .where(and(isNull(schema.productFamilies.missingSince), liveIds.length ? notInArray(schema.productFamilies.id, liveIds) : undefined));

  // Variants point at their family; those of reference pages and hidden products at none.
  await tx.update(variants).set({ familyId: null, familyOptions: {} });
  const assignments = families.flatMap((f) =>
    f.variantIds.map((vid) => [vid, idByKey.get(f.key)!, JSON.stringify(f.variantOptions[vid] ?? {})] as const),
  );
  for (const batch of chunks(assignments)) {
    await tx.execute(sql`
      UPDATE variants AS t SET family_id = v.family_id::uuid, family_options = v.options::jsonb
      FROM (VALUES ${sql.join(batch.map(([vid, fid, opts]) => sql`(${vid}, ${fid}, ${opts})`), sql`, `)}) AS v(variant_id, family_id, options)
      WHERE t.id = v.variant_id::uuid`);
  }

  await tx.delete(schema.specValues);
  const specRows = families.flatMap((f) =>
    f.specs.map((s) => ({
      familyId: idByKey.get(f.key)!,
      variantId: s.variantId,
      key: s.key,
      value: s.value,
      num: s.num === null ? null : String(s.num),
      unit: s.unit,
      source: s.source,
    })),
  );
  for (const batch of chunks(specRows, 1000)) await tx.insert(schema.specValues).values(batch);

  await tx.delete(schema.groupingIssues);
  for (const batch of chunks(issues)) await tx.insert(schema.groupingIssues).values(batch);

  // The home page's category photos, so it doesn't rank every family on each render.
  const photos = categoryPhotos(
    families.flatMap((f, i) => {
      const row = familyValues[i];
      if (row.status !== "published") return [];
      return [{ title: row.title, categorySlug: f.categorySlug, available: row.available, minPriceUsd: row.minPriceUsd === null ? null : Number(row.minPriceUsd), variantCount: row.variantCount, images: row.images }];
    }),
  );
  for (const [slug, id] of categoryIds) await tx.update(categories).set({ images: photos.get(slug) ?? [] }).where(eq(categories.id, id));

  return summarize(families, productById, variantById, variantsByProduct, issues);
}

/**
 * Lays the admin's overrides over the store's values (S15, S16c): name, description and
 * photos per product; USD price, fixed ₪ price, SKU, options per variant; availability per
 * product. A new override applies and a removed one brings the store's value back. Rows
 * that already match are left alone, so a regroup with no change writes nothing.
 */
export async function applyOverrides(tx: Tx): Promise<void> {
  await tx.execute(sql`
    WITH target AS (
      SELECT p.id,
             coalesce(o.title, p.store_title) AS title,
             CASE WHEN o.description_html IS NOT NULL THEN nullif(o.description_html, '') ELSE p.store_description_html END AS description_html,
             coalesce(o.images, p.store_images) AS images
        FROM products p LEFT JOIN product_overrides o ON o.product_id = p.id
       WHERE p.store_title IS NOT NULL
    )
    UPDATE products AS p SET title = t.title, description_html = t.description_html, images = t.images FROM target t
     WHERE t.id = p.id
       AND (p.title IS DISTINCT FROM t.title OR p.description_html IS DISTINCT FROM t.description_html OR p.images IS DISTINCT FROM t.images)`);
  await tx.execute(sql`
    WITH target AS (
      SELECT v.id,
             coalesce(o.price_usd, v.supplier_price_usd) AS price,
             o.fixed_ils AS fixed,
             CASE WHEN o.sku IS NOT NULL THEN nullif(o.sku, '') ELSE v.store_sku END AS sku,
             coalesce(o.options, v.store_options, v.options) AS options,
             coalesce(po.available, v.store_available) AS available,
             v.store_options IS NOT NULL AS has_store
        FROM variants v
        LEFT JOIN variant_overrides o ON o.variant_id = v.id
        LEFT JOIN product_overrides po ON po.product_id = v.product_id
    )
    UPDATE variants AS v
       SET price_usd = t.price, fixed_ils = t.fixed,
           supplier_sku = CASE WHEN t.has_store THEN t.sku ELSE v.supplier_sku END,
           options = t.options,
           available = CASE WHEN t.has_store THEN t.available ELSE v.available END
      FROM target t
     WHERE t.id = v.id
       AND (v.price_usd IS DISTINCT FROM t.price OR v.fixed_ils IS DISTINCT FROM t.fixed OR v.options IS DISTINCT FROM t.options
            OR (t.has_store AND (v.supplier_sku IS DISTINCT FROM t.sku OR v.available IS DISTINCT FROM t.available)))`);
}

/** The USD→ILS rate prices use now: the admin's manual one, else the latest Bank of Israel one. */
async function loadRate(tx: Tx): Promise<number> {
  const [row] = await tx.select({ data: schema.siteSettings.data }).from(schema.siteSettings).where(eq(schema.siteSettings.id, 1));
  const manual = parseSettings(row?.data).pricing.rateOverride;
  if (manual) return manual.rate;
  const [latest] = await tx
    .select({ rate: schema.exchangeRates.rate })
    .from(schema.exchangeRates)
    .where(eq(schema.exchangeRates.currency, "USD"))
    .orderBy(desc(schema.exchangeRates.rateDate))
    .limit(1);
  return latest ? Number(latest.rate) : 0;
}

/** The admin's multipliers (S16a): the global one from site_settings, the rest from pricing_rules. */
export async function loadPricingRules(tx: Tx): Promise<PricingRuleSet> {
  const [row] = await tx.select({ data: schema.siteSettings.data }).from(schema.siteSettings).where(eq(schema.siteSettings.id, 1));
  const rules = await tx.select().from(schema.pricingRules);
  const of = (scope: "supplier" | "category") => new Map(rules.filter((r) => r.scope === scope).map((r) => [r.targetId, Number(r.multiplier)]));
  return { global: parseSettings(row?.data).pricing.markup, bySupplier: of("supplier"), byCategory: of("category") };
}

/**
 * Writes each variant's multiplier (variants.markup) from the rules, by its supplier and
 * its product's category as the admin left it. Every price reads it (priceIls), so a
 * changed rule reprices the catalog once this runs; order snapshots keep their own.
 */
export async function applyPricingRules(tx: Tx): Promise<void> {
  const rules = await loadPricingRules(tx);
  // Not tx.execute: postgres.js and node-postgres return its rows differently.
  const rows = await tx
    .select({
      id: schema.variants.id,
      supplierId: schema.variants.supplierId,
      categoryId: sql<string | null>`coalesce(${schema.productOverrides.categoryId}, ${schema.products.categoryId})`,
      markup: schema.variants.markup,
    })
    .from(schema.variants)
    .innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
    .leftJoin(schema.productOverrides, eq(schema.productOverrides.productId, schema.products.id));
  const byMarkup = new Map<string, string[]>();
  for (const r of rows) {
    const resolved = resolveMarkup(rules, { supplierId: r.supplierId, categoryId: r.categoryId });
    if (resolved.kind !== "markup") continue;
    const value = resolved.markup.toFixed(3);
    if (r.markup !== null && Number(r.markup).toFixed(3) === value) continue;
    byMarkup.set(value, [...(byMarkup.get(value) ?? []), r.id]);
  }
  for (const [value, ids] of byMarkup)
    for (const batch of chunks(ids, 1000))
      await tx.execute(sql`UPDATE variants SET markup = ${value} WHERE id IN (${sql.join(batch.map((id) => sql`${id}::uuid`), sql`, `)})`);
}

/** Every product override, with its category as a slug like the grouping uses. */
async function loadOverrides(tx: Tx): Promise<Map<string, ProductOverride>> {
  const rows = await tx
    .select({
      productId: schema.productOverrides.productId,
      hidden: schema.productOverrides.hidden,
      images: schema.productOverrides.images,
      categorySlug: schema.categories.slug,
      alone: schema.productOverrides.alone,
      mergeKey: schema.productOverrides.mergeKey,
      pinRank: schema.productOverrides.pinRank,
    })
    .from(schema.productOverrides)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.productOverrides.categoryId));
  return new Map(rows.map((r) => [r.productId, r]));
}

/** Drizzle's property names to the table's column names, for the upsert's `excluded.` references. */
function toColumn(key: string) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

type ProductRow = {
  id: string;
  supplierCode: string;
  supplierName: string;
  title: string;
  descriptionHtml: string | null;
  images: string[];
  programs: ("FRC" | "FTC")[];
  status: "published" | "review" | "hidden";
};
type VariantRow = {
  id: string;
  productId: string;
  sku: string | null;
  options: { name: string; value: string }[];
  priceUsd: string | null;
  markup: string | null;
  fixedIls: string | null;
  available: boolean | null;
  shipsLater: boolean;
};

function familyRow(
  f: FamilyDraft,
  productById: Map<string, ProductRow>,
  variantById: Map<string, VariantRow>,
  categoryIds: Map<string, string>,
  now: Date,
  rate: number,
) {
  const members = f.productIds.map((id) => productById.get(id)!);
  const primary = productById.get(f.primaryProductId)!;
  const ordered = [primary, ...members.filter((m) => m.id !== primary.id)];
  const memberVariants = f.variantIds.map((id) => variantById.get(id)!);
  const priced = memberVariants.filter((v) => v.priceUsd && Number(v.priceUsd) > 0);
  const prices = priced.map((v) => Number(v.priceUsd));
  // USD × the variant's own multiplier (or a fixed ₪ price ÷ the rate), so a family whose parts are priced differently still shows its true ₪ range.
  const lists = memberVariants.flatMap((v) => {
    const list = listUsd(v, rate);
    return list === null ? [] : [list];
  });
  const availability = memberVariants.map((v) => v.available);

  return {
    key: f.key,
    slug: f.slug,
    title: f.title,
    categoryId: f.categorySlug ? (categoryIds.get(f.categorySlug) ?? null) : null,
    grouping: f.grouping,
    primaryProductId: primary.id,
    supplierCodes: f.suppliers,
    programs: [...new Set(members.flatMap((m) => m.programs))],
    images: [...new Set(ordered.flatMap((m) => m.images))].slice(0, 8),
    descriptionHtml: ordered.find((m) => isRealDescription(m.descriptionHtml))?.descriptionHtml ?? null,
    optionKeys: f.optionKeys,
    variantCount: memberVariants.length,
    minPriceUsd: prices.length ? Math.min(...prices).toFixed(2) : null,
    maxPriceUsd: prices.length ? Math.max(...prices).toFixed(2) : null,
    minListUsd: lists.length ? Math.min(...lists).toFixed(2) : null,
    maxListUsd: lists.length ? Math.max(...lists).toFixed(2) : null,
    available: availability.every((a) => a === null) ? null : availability.some((a) => a === true),
    shipsLater: memberVariants.some((v) => v.available === true) && memberVariants.filter((v) => v.available === true).every((v) => v.shipsLater),
    status: members.some((m) => m.status === "published") ? ("published" as const) : ("review" as const),
    // Only this family's own variants, so a reseller product spanning families doesn't
    // make a SKU from one of them find the other.
    searchText: [
      f.title,
      ...members.map((m) => `${m.title} ${m.supplierName}`),
      ...memberVariants.flatMap((v) => [v.sku, ...Object.values(f.variantOptions[v.id] ?? {}), ...v.options.map((o) => o.value)]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    lastSeenAt: now,
    missingSince: null,
  };
}

function summarize(
  families: FamilyDraft[],
  productById: Map<string, ProductRow>,
  variantById: Map<string, VariantRow>,
  _variantsByProduct: Map<string, VariantRow[]>,
  issues: { reason: string }[],
): RegroupCounts {
  const byGrouping: Record<string, number> = {};
  const bySupplier: Record<string, { variants: number; families: number }> = {};
  for (const f of families) {
    byGrouping[f.grouping] = (byGrouping[f.grouping] ?? 0) + 1;
    for (const code of f.suppliers) {
      bySupplier[code] ??= { variants: 0, families: 0 };
      bySupplier[code].families++;
    }
    for (const id of f.variantIds) {
      bySupplier[productById.get(variantById.get(id)!.productId)!.supplierCode].variants++;
    }
  }
  const issueCounts: Record<string, number> = {};
  for (const i of issues) issueCounts[i.reason] = (issueCounts[i.reason] ?? 0) + 1;
  return {
    families: families.length,
    byGrouping,
    bySupplier,
    multiSupplierFamilies: families.filter((f) => f.suppliers.length > 1).length,
    issues: issueCounts,
  };
}

