import { optionDisplay } from "./option-label";
import { measure } from "./parse";
import { compareOptionValues, optionLabel, specLabel } from "./sort";

/**
 * The product page's one spec table. Option rows (bore, teeth) and the variants' own specs
 * show the value once the choice so far settles it, a short summary before that ("4
 * אפשרויות", "30t – 300t"), never the whole list. The supplier's fixed specs from its
 * description always show. Rows are merged by their Hebrew name, so "Nominal Voltage" and
 * "Voltage" can't both become מתח.
 */
export type SpecRow = {
  /** Hebrew, or the supplier's English name when we don't know it. */
  label: string;
  value: string;
  /** A second line under an option value ("2 שלבים"). */
  sub: string | null;
  /** True while several values are left: the value is a count or a range. */
  summary: boolean;
};

type Spec = { key: string; value: string };
export type SpecVariant = { options: Record<string, string>; specs: Spec[] };

/** About three lines of the table's value column. */
const CELL_LIMIT = 120;

/** "4 אפשרויות", "30t – 300t", or a short list ("9mm, 15mm"). */
function summarize(values: string[]): string {
  const sorted = [...values].sort(compareOptionValues);
  const sizes = sorted.map(measure);
  const numeric = sizes.every((m) => m.num !== null) && new Set(sizes.map((m) => m.unit)).size === 1;
  if (numeric && sorted.length > 2) return `${sorted[0]} – ${sorted.at(-1)}`;
  const list = sorted.map((v) => optionDisplay(v).label).join(", ");
  if (sorted.length <= 3 && list.length <= 30) return list;
  return `${sorted.length.toLocaleString("he-IL")} אפשרויות`;
}

const clip = (text: string) => (text.length <= CELL_LIMIT ? text : `${text.slice(0, text.lastIndexOf(",", CELL_LIMIT) > 40 ? text.lastIndexOf(",", CELL_LIMIT) : CELL_LIMIT).trimEnd()}…`);

/**
 * `variants` are the ones the choice so far leaves (all of them before a choice); `fixed`
 * are the description's specs, the same for every variant.
 */
export function specRows(optionKeys: string[], variants: SpecVariant[], fixed: Spec[]): SpecRow[] {
  const rows = new Map<string, SpecRow>();
  const varying = (label: string, values: string[]) => {
    const distinct = [...new Set(values.filter((v) => v.trim() !== ""))];
    if (distinct.length === 0 || rows.has(label)) return;
    if (distinct.length === 1) {
      const { label: shown, sub } = optionDisplay(distinct[0]);
      rows.set(label, { label, value: clip(shown), sub, summary: false });
    } else rows.set(label, { label, value: summarize(distinct), sub: null, summary: true });
  };

  for (const key of optionKeys) varying(optionLabel(key), variants.flatMap((v) => (v.options[key] ? [v.options[key]] : [])));
  const specKeys = [...new Set(variants.flatMap((v) => v.specs.map((s) => s.key)))];
  for (const key of specKeys) varying(optionLabel(key), variants.flatMap((v) => v.specs.filter((s) => s.key === key).map((s) => s.value)));

  const fromText = new Set<string>();
  for (const s of fixed) {
    const label = specLabel(s.key);
    const value = s.value.replace(/\s+/g, " ").trim();
    if (!value) continue;
    const row = rows.get(label);
    if (!row) {
      rows.set(label, { label, value: clip(value), sub: null, summary: false });
      fromText.add(label);
    }
    // Two of the supplier's specs with one Hebrew name: one row, both values while they fit.
    // An option or variant row of the same name wins: it follows the choice.
    else if (fromText.has(label) && !row.value.includes(value) && `${row.value}, ${value}`.length <= CELL_LIMIT) row.value = `${row.value}, ${value}`;
  }
  return [...rows.values()].slice(0, 30);
}
