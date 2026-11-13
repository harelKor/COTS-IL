import "server-only";
import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import type { PriceContext } from "@/domain/pricing";
import { parseSettings, type Business, type Settings } from "@/domain/settings";
import { getUsdIlsRate } from "./fx";

/**
 * The admin's settings (S16), cached under the `settings` tag that every save in
 * /admin/settings invalidates. A missing row reads as the defaults (all business
 * facts null, the 1.6 multiplier), so the site never breaks on it.
 */
export async function getSettings(): Promise<Settings> {
  "use cache";
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

/** What every price needs: the rate (manual if set), the global multiplier, rounding and the minimum. */
export async function priceContext(): Promise<Pricing> {
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

/** What the browser's cart sheet and product page quote (SiteFactsProvider). */
export async function getSiteFacts() {
  const [{ business, pricing }, rules] = await Promise.all([getSettings(), getPricingRules()]);
  const all = [pricing.markup, ...rules.map((r) => r.multiplier)];
  return {
    quoteLeadBusinessDays: business.quoteLeadBusinessDays,
    priceIncludes: business.priceIncludes,
    leadTimes: business.leadTimes,
    markupRange: [Math.min(...all), Math.max(...all)] as [number, number],
  };
}
export type SiteFacts = Awaited<ReturnType<typeof getSiteFacts>>;
