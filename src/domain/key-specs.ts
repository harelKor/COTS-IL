import { countOf, OPTION } from "./plural";
import { sortValue } from "./specs/units";

/**
 * The list view's key spec columns (P2-4, McMaster's idea made light): two or three specs per
 * category, from CF1's clean `spec_values`. A column can read the first of several keys a family
 * has (Gears: DP, or the module for metric gears).
 */
export type KeySpecColumn = { label: string; keys: string[] };

export const KEY_SPECS: Record<string, KeySpecColumn[]> = {
  gears: [
    { label: "DP", keys: ["dp", "module"] },
    { label: "שיניים", keys: ["teeth"] },
    { label: "קדח", keys: ["bore"] },
  ],
  bearings: [
    { label: "קוטר פנימי", keys: ["id", "bore"] },
    { label: "קוטר חיצוני", keys: ["od"] },
    { label: "רוחב", keys: ["width"] },
  ],
  "belts-chain": [
    { label: "פסיעה", keys: ["pitch"] },
    { label: "שיניים", keys: ["teeth"] },
    { label: "רוחב", keys: ["width"] },
  ],
  // Shafts share the category with spacers and standoffs, which state an OD and often no shape;
  // AndyMark's spacers give their length as the width ("WD").
  shafts: [
    { label: "צורה", keys: ["bore"] },
    { label: "קוטר חיצוני", keys: ["od"] },
    { label: "אורך", keys: ["length", "width"] },
  ],
};

export function keySpecColumns(category: string | null | undefined): KeySpecColumn[] {
  return (category && KEY_SPECS[category]) || [];
}

/** Every spec key the columns read, for the query. */
export const keySpecKeys = (columns: KeySpecColumn[]) => [...new Set(columns.flatMap((c) => c.keys))];

export type SpecValue = { key: string; value: string; num: number | null; unit: string | null };
/**
 * One cell: the column's name and a short summary, or null when the family states none. `ltr` is
 * false for our own Hebrew count ("3 אפשרויות"), which must not be set left to right.
 */
export type KeySpec = { label: string; value: string | null; ltr: boolean };

/** Longest list of values a cell shows as is; past it, a range or a count. */
const CELL_CHARS = 16;

/** A plain size or count ("12T", '1/2"', "8mm", "20 DP"), with nothing else in the text: those can be a range. */
const isPlainSize = (value: string) => /^[\d.\/\-\s]+(?:mm|"|t|dp|ft|in)?$/i.test(value.trim());

/**
 * A cell like the product page's spec table: one value as it is, a range for sizes ("12T – 60T",
 * "20–48 DP"), a short list ('1/2" Hex, 8mm Round'), or "5 אפשרויות". Never a long list.
 */
export function summarizeSpec(rows: Omit<SpecValue, "key">[]): string | null {
  const byValue = new Map<string, Omit<SpecValue, "key">>();
  for (const r of rows) if (r.value.trim() && !byValue.has(r.value)) byValue.set(r.value, r);
  const distinct = [...byValue.values()];
  if (distinct.length === 0) return null;
  if (distinct.length === 1) return distinct[0].value;
  const order = (r: Omit<SpecValue, "key">) => sortValue(r.num, r.unit) ?? Number.POSITIVE_INFINITY;
  const sorted = distinct.sort((a, b) => order(a) - order(b) || a.value.localeCompare(b.value, "en", { numeric: true }));
  const sizes = sorted.every((r) => r.num !== null && isPlainSize(r.value)) && new Set(sorted.map((r) => r.unit)).size === 1;
  if (sizes && sorted.length > 2) {
    const [first, last] = [sorted[0].value, sorted.at(-1)!.value];
    // "20 DP" … "48 DP" → "20–48 DP"; "12T" … "60T" → "12T – 60T".
    const unit = / (\S+)$/.exec(first)?.[1];
    return unit && last.endsWith(` ${unit}`) ? `${first.slice(0, -unit.length - 1)}–${last}` : `${first} – ${last}`;
  }
  const list = sorted.map((r) => r.value).join(", ");
  if (sorted.length <= 2 && list.length <= CELL_CHARS) return list;
  return countOf(sorted.length, OPTION);
}

/** A family's cells, one per column, from its spec values (the variants already narrowed by the filters). */
export function keySpecsOf(columns: KeySpecColumn[], values: SpecValue[]): KeySpec[] {
  return columns.map((column) => {
    for (const key of column.keys) {
      const value = summarizeSpec(values.filter((v) => v.key === key));
      if (value) return { label: column.label, value, ltr: !/[֐-׿]/.test(value) };
    }
    return { label: column.label, value: null, ltr: true };
  });
}
