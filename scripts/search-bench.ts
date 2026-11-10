/**
 * The S5 search benchmark: 30 real queries against /api/search, with the first
 * results and warm latency. `npx tsx scripts/search-bench.ts [base-url] [out.md]`
 * (default http://localhost:3000). Each query runs once cold, then 5 times warm.
 */
import { writeFileSync } from "node:fs";

export const QUERIES = [
  "kraken", "kraken x60", "krakn x60", "kraken x44", "falcon 500", "neo vortex", "spark max",
  "wcp-0749", "wcp0749", "WCP 0749", "am-3430", "am3430",
  "bearing", "bearings", "hex bearing", "gear", "battery", "htd pulley", "pigeon",
  "מיסב", "מיסבים", "מנוע", "גלגל שיניים", "ספרינג", "ספרוקט", "גיר", "ציר משושה", "ספארק", "סוללה",
  "beraing",
];

type Result = { title: string; sku: string | null; href: string };

async function main() {
  const base = process.argv[2] ?? "http://localhost:3000";
  const out = process.argv[3];
  const rows: string[] = ["| # | Query | Hits | First result | 2nd | 3rd |", "|---|---|---|---|---|---|"];
  const warm: number[] = [];
  for (const [i, q] of QUERIES.entries()) {
    const url = `${base}/api/search?q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    const body = (await res.json()) as { results: Result[] };
    for (let n = 0; n < 5; n++) {
      const t = performance.now();
      await (await fetch(url)).json();
      warm.push(performance.now() - t);
    }
    const r = body.results;
    const cell = (x?: Result) => (x ? `${x.title}${x.sku ? ` (${x.sku})` : ""}`.replace(/\|/g, "/") : "");
    rows.push(`| ${i + 1} | ${q} | ${r.length} | ${cell(r[0])} | ${cell(r[1])} | ${cell(r[2])} |`);
  }
  warm.sort((a, b) => a - b);
  const p = (x: number) => warm[Math.min(warm.length - 1, Math.floor(x * warm.length))].toFixed(0);
  rows.push("", `Warm latency over ${warm.length} requests: p50 ${p(0.5)} ms, p95 ${p(0.95)} ms`);
  const text = rows.join("\n");
  if (out) writeFileSync(out, text);
  console.log(text);
}

main();
