/**
 * Daily catalog sync, run by .github/workflows/sync.yml. Each supplier syncs on
 * its own, so one store being down doesn't stop the others, and the run exits
 * with an error if any of them failed.
 *
 *   npm run sync                  every active supplier with "sync nightly" on
 *   npm run sync -- wcp           one supplier, nightly or not ("סנכרון עכשיו" in /admin/settings/suppliers)
 *   npm run sync -- --full        also read every BigCommerce page (otherwise only on Saturdays, UTC)
 *   npm run sync -- gobilda --refresh   only the BigCommerce pages in carts, open orders and pins
 *
 * Shopify stores are read whole every night (a few requests). BigCommerce stores (goBILDA, REV)
 * are read page by page at one request a second, so the whole catalog is read once a week
 * (about an hour) and on other nights only the parts teams are buying (src/suppliers/bigcommerce.ts).
 */
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { fetchShopifyCatalog } from "../src/suppliers/shopify";
import { fetchBigCommerceCatalog } from "../src/suppliers/bigcommerce";
import { regroupCatalog } from "../src/suppliers/families";
import { checkShipsLater, hasStockCheck } from "../src/suppliers/stock";
import { fetchBestSellers, saveBestSellerRanks } from "../src/suppliers/best-sellers";
import { describeError, knownProducts, refreshTargets, refreshUsdRate, syncSupplier } from "../src/suppliers/sync";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(sql, { schema });

type Supplier = typeof schema.suppliers.$inferSelect;

/** A full pass on Saturdays (UTC), when asked, or for one supplier synced by hand; otherwise the refresh. */
function bigCommerceMode(only: string | undefined, flags: Set<string>): "full" | "refresh" {
  if (flags.has("--refresh")) return "refresh";
  if (flags.has("--full") || only) return "full";
  return new Date().getUTCDay() === 6 ? "full" : "refresh";
}

async function syncBigCommerce(supplier: Supplier, wanted: "full" | "refresh", rate: number) {
  const mode = wanted === "refresh" && (await knownProducts(db, supplier.id)) === 0 ? "full" : wanted;
  const log = (line: string) => console.log(`${supplier.code}: ${line}`);
  if (mode === "refresh") {
    const urls = await refreshTargets(db, supplier.id);
    if (urls.length === 0) return { mode, skipped: "nothing in carts, open orders or pins" };
    log(`refreshing ${urls.length} pages`);
    return syncSupplier(db, supplier, () => fetchBigCommerceCatalog(supplier.baseUrl, supplier.programs, { urls, log }), rate, "refresh");
  }
  log("full pass");
  return syncSupplier(db, supplier, () => fetchBigCommerceCatalog(supplier.baseUrl, supplier.programs, { log }), rate, "full");
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const only = args.find((a) => !a.startsWith("--"));
  const suppliers = await db
    .select()
    .from(schema.suppliers)
    .where(and(eq(schema.suppliers.active, true), inArray(schema.suppliers.platform, ["shopify", "bigcommerce"])));
  const selected = suppliers.filter((s) => (only ? s.code === only : s.syncEnabled));
  if (selected.length === 0) throw new Error(`No supplier to sync${only ? ` matching "${only}"` : ""}`);

  // Prices are USD × this rate (or the admin's manual one) × the multiplier (src/domain/pricing.ts), read when pages render.
  const usd = await refreshUsdRate(db);
  if (usd.fetched) console.log(`USD rate ${usd.rate} (${usd.rateDate}) from Bank of Israel`);
  else console.warn(`Bank of Israel fetch failed (${usd.error}), keeping ${usd.rate} from ${usd.rateDate}`);

  let failed = 0;
  // Shopify first: a few requests each. The BigCommerce page reads come after, so they never hold the others up.
  const shopify = selected.filter((s) => s.platform === "shopify");
  const bigCommerce = selected.filter((s) => s.platform === "bigcommerce");
  for (const supplier of shopify) {
    try {
      const counts = await syncSupplier(db, supplier, () => fetchShopifyCatalog(supplier.baseUrl, supplier.programs), usd.rate);
      console.log(supplier.code, counts);
    } catch (error) {
      failed++;
      console.error(`${supplier.code} failed: ${describeError(error)}`);
    }
    // The store's best sellers, for "הכי מבוקשים" until our own orders take over (src/domain/popular.ts).
    // Optional: a store that blocks the page keeps yesterday's ranks, and the sync still succeeds.
    try {
      const ranked = await saveBestSellerRanks(db, supplier.id, await fetchBestSellers(supplier.baseUrl));
      console.log(supplier.code, `best sellers: ${ranked} products ranked`);
    } catch (error) {
      console.warn(`${supplier.code} best sellers skipped: ${describeError(error)}`);
    }
  }

  // Backorder ("ships later") from the stores that expose it; then regroup so families show it.
  const checked = shopify.filter((s) => hasStockCheck(s.code));
  for (const supplier of checked) {
    try {
      console.log(`${supplier.code} stock`, await checkShipsLater(db, supplier));
    } catch (error) {
      console.error(`${supplier.code} stock check failed: ${describeError(error)}`);
    }
  }
  if (checked.length > 0) await db.transaction((tx) => regroupCatalog(tx));

  const mode = bigCommerceMode(only, flags);
  for (const supplier of bigCommerce) {
    try {
      console.log(supplier.code, await syncBigCommerce(supplier, mode, usd.rate));
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
