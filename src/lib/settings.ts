import "server-only";
import { asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import type { PriceContext } from "@/domain/pricing";
import { parseSettings, type Business, type Settings } from "@/domain/settings";
import { getUsdIlsRate } from "./fx";
import { SEARCH_CATEGORIES } from "./search-examples";

/**
 * The admin's settings (S16), cached under the `settings` tag that every save in
 * /admin/settings invalidates. A missing row reads as the defaults (all business
 * facts null, the 1.6 multiplier), so the site never breaks on it.
 *
 * In Vercel's shared Runtime Cache (`"use cache: remote"`), so a new server instance reads
 * it from the region's cache instead of the database (docs/AUDIT-2026-11-14.md S-2).
 */
export async function getSettings(): Promise<Settings> {
  "use cache";
  cacheLife("days");
  cacheTag("settings");
  return settingsShared();
}

/** The shared (remote) entry behind getSettings's in-memory one. */
async function settingsShared(): Promise<Settings> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("settings");
  const [row] = await db.select({ data: schema.siteSettings.data }).from(schema.siteSettings).where(eq(schema.siteSettings.id, 1));
  return parseSettings(row?.data);
}

/** The business facts the UI quotes; a null value hides its sentence. */
export async function getBusiness(): Promise<Business> {
  return (await getSettings()).business;
}

export type Pricing = PriceContext & {
  /** The Bank of Israel rate and its date, whether or not a manual rate replaces it. */
  boiRate: number;
  rateDate: string;
  manualRate: boolean;
};

/**
 * What every price needs: the rate (manual if set), the global multiplier, rounding and the minimum.
 * Read by nearly every render, so it stays in the instance's memory (`"use cache"`) on top of the
 * two shared remote entries it's made of: a hit costs no network read at all.
 */
export async function priceContext(): Promise<Pricing> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings", "catalog");
  const [{ rate, rateDate }, { pricing }] = await Promise.all([getUsdIlsRate(), getSettings()]);
  const manual = pricing.rateOverride;
  return {
    rate: manual ? manual.rate : rate,
    markup: pricing.markup,
    roundTo: pricing.roundTo,
    minIls: pricing.minIls,
    boiRate: rate,
    rateDate,
    manualRate: !!manual,
  };
}

export type PricingRuleRow = { id: string; scope: "supplier" | "category"; targetId: string; multiplier: number };

/** The per-supplier and per-category multipliers (pricing_rules). */
export async function getPricingRules(): Promise<PricingRuleRow[]> {
  "use cache";
  cacheLife("days");
  cacheTag("settings");
  const rows = await db.select().from(schema.pricingRules);
  return rows.map((r) => ({ id: r.id, scope: r.scope, targetId: r.targetId, multiplier: Number(r.multiplier) }));
}

/** Every category's name and whether it's hidden, in the admin's order (renames show at once). */
export async function getCategoryList(): Promise<{ slug: string; name: string; hidden: boolean }[]> {
  "use cache";
  cacheLife("days");
  cacheTag("catalog");
  return db
    .select({ slug: schema.categories.slug, name: schema.categories.name, hidden: schema.categories.hidden })
    .from(schema.categories)
    .orderBy(asc(schema.categories.sortOrder));
}

/** What the browser's cart sheet, product page, search panel and category groups need (SiteFactsProvider). */
export async function getSiteFacts() {
  const [{ business, pricing, content }, rules, categoryList] = await Promise.all([getSettings(), getPricingRules(), getCategoryList()]);
  const all = [pricing.markup, ...rules.map((r) => r.multiplier)];
  const shown = new Map(categoryList.filter((c) => !c.hidden).map((c) => [c.slug, c.name]));
  return {
    banner: content.banner,
    categoryGroups: content.categoryGroups,
    searchExamples: content.searchExamples,
    /** The empty search panel's categories: SEARCH_CATEGORIES with the admin's names, hidden ones left out. */
    searchCategories: SEARCH_CATEGORIES.flatMap((slug) => (shown.has(slug) ? [{ slug, name: shown.get(slug)! }] : [])),
    quoteLeadBusinessDays: business.quoteLeadBusinessDays,
    priceIncludes: business.priceIncludes,
    leadTimes: business.leadTimes,
    markupRange: [Math.min(...all), Math.max(...all)] as [number, number],
  };
}
export type SiteFacts = Awaited<ReturnType<typeof getSiteFacts>>;
