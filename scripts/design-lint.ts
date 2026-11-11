/**
 * Design lint (S11): fails CI on the design-system regressions a type checker can't see.
 *   - text under 13px (`text-[9px]`–`text-[12px]`, `text-xs`)
 *   - buttons, links and fields under 44px (`h-8`/`h-9`/`h-10`, `size-*`, `min-h-*` of the same)
 *   - `font-bold` (headlines are 600: `font-semibold`)
 *   - hex colours in TSX (use tokens from globals.css)
 *   - ₪ amounts that bypass `formatIls`
 * Run: npm run design-lint
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..", "src");

/** Files allowed to carry raw hex: generated images and the browser theme colour. */
const HEX_ALLOWED = new Set(["app/opengraph-image.tsx", "app/layout.tsx", "app/icon.tsx", "app/apple-icon.tsx"]);

type Problem = { file: string; line: number; rule: string; text: string };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__fixtures__" ? [] : walk(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

/** Opening tags of interactive elements; `=>` inside handlers doesn't end the tag. */
const INTERACTIVE = /<(button|a|Link|input|select|textarea|summary)\b(?:=>|[^>])*>/g;
const SMALL_TARGET = /(?<![\w:-])(?:h|size|min-h)-(?:7|8|9|10)(?![\w.-])/;

function lintSource(file: string, source: string): Problem[] {
  const problems: Problem[] = [];
  const add = (index: number, rule: string, text: string) => problems.push({ file, line: lineOf(source, index), rule, text: text.trim().slice(0, 120) });

  for (const m of source.matchAll(/(?<![\w-])text-(?:\[(?:9|1[0-2])px\]|xs)(?![\w-])/g)) add(m.index, "text under 13px", m[0]);
  for (const m of source.matchAll(/(?<![\w-])font-(?:bold|extrabold|black)(?![\w-])/g)) {
    // The wordmark "COTS-IL" is the one heavy-weight exception.
    if (/COTS-IL|text-brand-gradient/.test(source.slice(m.index - 200, m.index + 200)) && m[0] === "font-extrabold") continue;
    add(m.index, "font-bold (use font-semibold)", m[0]);
  }
  for (const m of source.matchAll(INTERACTIVE)) {
    const small = m[0].match(SMALL_TARGET);
    if (small) add(m.index, "tap target under 44px", `<${m[1]} … ${small[0]}`);
  }
  if (!HEX_ALLOWED.has(file)) {
    for (const m of source.matchAll(/(?<![\w&{/])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g)) add(m.index, "hex colour in TSX (use a token)", m[0]);
  }
  for (const m of source.matchAll(/₪\s*\{|\}\s*₪|currency:\s*["']ILS["']/g)) add(m.index, "₪ amount bypasses formatIls", m[0]);
  return problems;
}

const problems = walk(root).flatMap((path) => lintSource(relative(root, path).split(sep).join("/"), readFileSync(path, "utf8")));
for (const p of problems) console.log(`src/${p.file}:${p.line}  ${p.rule}  ${p.text}`);
if (problems.length) {
    console.error(`\ndesign-lint: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("design-lint: clean");
