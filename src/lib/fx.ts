import "server-only";
import { desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import { assertRate } from "@/domain/pricing";

export type UsdIlsRate = { rate: number; rateDate: string };

/**
 * The latest Bank of Israel USD rate the sync stored. Cached with the catalog,
 * so the sync's revalidate call picks up a new rate. The migration seeds a rate,
 * so a missing one is a broken database and pages fail rather than misprice.
 */
export async function getUsdIlsRate(): Promise<UsdIlsRate> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const [row] = await db
    .select({ rate: schema.exchangeRates.rate, rateDate: schema.exchangeRates.rateDate })
    .from(schema.exchangeRates)
    .where(eq(schema.exchangeRates.currency, "USD"))
    .orderBy(desc(schema.exchangeRates.rateDate))
    .limit(1);
  if (!row) throw new Error("No USD→ILS rate in exchange_rates");
  return { rate: assertRate(Number(row.rate)), rateDate: row.rateDate };
}

/** Just the number, for priceIls(). */
export async function usdIlsRate(): Promise<number> {
  return (await getUsdIlsRate()).rate;
}
