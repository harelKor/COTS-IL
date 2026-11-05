/**
 * Rebuilds product families from the catalog already in the database, without
 * fetching from the suppliers. The sync does this itself; run it after deploying
 * a change to the grouping rules (src/domain/families), or to see the counts.
 *
 *   npm run regroup
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { regroupCatalog } from "../src/suppliers/families";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(sql, { schema });

db.transaction((tx) => regroupCatalog(tx))
  .then((counts) => console.log(JSON.stringify(counts, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
