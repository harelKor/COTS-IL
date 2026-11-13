import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { regroupCatalog } from "@/suppliers/families";

/**
 * Rebuilds the families (and each part's multiplier) the way the nightly sync does, about
 * 10 s. For the admin's catalog fixes (S15) and pricing settings (S16a); callers then
 * invalidate the `catalog` tag.
 */
export async function regroupNow() {
  await db.transaction(async (tx) => {
    // The app's 8 s statement limit is for page queries; a whole regroup needs longer.
    await tx.execute(sql`SET LOCAL statement_timeout = '45s'`);
    await regroupCatalog(tx);
  });
}
