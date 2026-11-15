/**
 * How many products in each category have each spec filter's value (CF1): families with
 * a value / all families, per category × facet, and where the values came from (option,
 * title or description) once spec_values has a source. Reads the database in .env.local,
 * the local stack (ports 544xx); `npm run regroup` first to see a change to the rules.
 *
 *   npm run facet-coverage                    # every category
 *   npm run facet-coverage -- gears bearings  # only these
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

/** The facets the catalog offers first (FACET_ORDER in src/lib/catalog.ts). */
const FACETS = ["dp", "module", "pitch", "teeth", "bore", "motor-fit", "width", "id", "od", "length", "cd", "material"];

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const only = process.argv.slice(2);
  const hasSource = (
    await sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'spec_values' AND column_name = 'source'`
  ).length > 0;

  const totals = await sql<{ slug: string; total: number }[]>`
    SELECT c.slug, count(*)::int AS total
    FROM product_families f JOIN categories c ON c.id = f.category_id
    WHERE f.missing_since IS NULL
    GROUP BY c.slug ORDER BY c.slug`;
  const rows = await sql<{ slug: string; key: string; families: number; values: number; sources: Record<string, number> | null }[]>`
    SELECT c.slug, sv.key, count(DISTINCT sv.family_id)::int AS families, count(DISTINCT sv.value)::int AS values,
      ${hasSource ? sql`(SELECT jsonb_object_agg(coalesce(s.source, '?'), s.n) FROM (
        SELECT sv2.source, count(DISTINCT sv2.family_id)::int AS n FROM spec_values sv2
        JOIN product_families f2 ON f2.id = sv2.family_id
        WHERE f2.category_id = c.id AND f2.missing_since IS NULL AND sv2.key = sv.key GROUP BY sv2.source) s)` : sql`NULL::jsonb`} AS sources
    FROM spec_values sv
    JOIN product_families f ON f.id = sv.family_id
    JOIN categories c ON c.id = f.category_id
    WHERE f.missing_since IS NULL AND sv.key IN ${sql(FACETS)}
    GROUP BY c.id, c.slug, sv.key`;

  for (const { slug, total } of totals) {
    if (only.length > 0 && !only.includes(slug)) continue;
    const facets = rows.filter((r) => r.slug === slug).sort((a, b) => FACETS.indexOf(a.key) - FACETS.indexOf(b.key));
    if (facets.length === 0) continue;
    console.log(`\n${slug} (${total} products)`);
    for (const f of facets) {
      const share = `${Math.round((100 * f.families) / total)}%`.padStart(4);
      const sources = f.sources ? `  [${Object.entries(f.sources).map(([s, n]) => `${s} ${n}`).join(", ")}]` : "";
      console.log(`  ${f.key.padEnd(10)} ${String(f.families).padStart(4)} / ${total}  ${share}  ${String(f.values).padStart(3)} values${sources}`);
    }
    if (slug === "gears") {
      const [{ n }] = await sql<{ n: number }[]>`
        SELECT count(DISTINCT sv.family_id)::int AS n FROM spec_values sv
        JOIN product_families f ON f.id = sv.family_id JOIN categories c ON c.id = f.category_id
        WHERE c.slug = 'gears' AND f.missing_since IS NULL AND sv.key IN ('dp', 'module')`;
      console.log(`  ${"dp|module".padEnd(10)} ${String(n).padStart(4)} / ${total}  ${`${Math.round((100 * n) / total)}%`.padStart(4)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
