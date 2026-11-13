/**
 * Daily catalog sync, run by .github/workflows/sync.yml. Each supplier syncs on
 * its own, so one store being down doesn't stop the others, and the run exits
 * with an error if any of them failed.
 *
 *   npm run sync            every active Shopify supplier with "sync nightly" on
 *   npm run sync -- wcp     one supplier, nightly or not ("סנכרון עכשיו" in /admin/settings/suppliers)
 */
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { fetchShopifyCatalog } from "../src/suppliers/shopify";
import { describeError, refreshUsdRate, syncSupplier } from "../src/suppliers/sync";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(sql, { schema });

async function main() {
  const only = process.argv[2];
  const suppliers = await db
    .select()
    .from(schema.suppliers)
    .where(and(eq(schema.suppliers.active, true), eq(schema.suppliers.platform, "shopify")));
  const selected = suppliers.filter((s) => (only ? s.code === only : s.syncEnabled));
  if (selected.length === 0) throw new Error(`No supplier to sync${only ? ` matching "${only}"` : ""}`);

  // Prices are USD × this rate (or the admin's manual one) × the multiplier (src/domain/pricing.ts), read when pages render.
  const usd = await refreshUsdRate(db);
  if (usd.fetched) console.log(`USD rate ${usd.rate} (${usd.rateDate}) from Bank of Israel`);
  else console.warn(`Bank of Israel fetch failed (${usd.error}), keeping ${usd.rate} from ${usd.rateDate}`);

  let failed = 0;
  for (const supplier of selected) {
    try {
      const counts = await syncSupplier(db, supplier, () => fetchShopifyCatalog(supplier.baseUrl, supplier.programs), usd.rate);
      console.log(supplier.code, counts);
    } catch (error) {
      failed++;
      console.error(`${supplier.code} failed: ${describeError(error)}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
