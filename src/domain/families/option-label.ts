import { compareOptionValues } from "./sort";

/**
 * How an option value reads on the product page. Only the words change, never the value
 * itself, so the SKU behind each choice stays the same: "2 Stage - 06.00:1 Ratio" shows as
 * "6:1" with "2 שלבים" under it.
 */

export type OptionDisplay = { label: string; sub: string | null };

/** "06.00" → "6", "04.77" → "4.77", "25.90" → "25.9". */
const plain = (n: string) => String(Number(n));

/** Zero-padded ratios ("06.00:1" → "6:1"). */
const ratios = (s: string) => s.replace(/\b(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\b/g, (_, a: string, b: string) => `${plain(a)}:${plain(b)}`);

const stages = (n: number) => (n === 1 ? "שלב אחד" : `${n} שלבים`);

export function optionDisplay(value: string): OptionDisplay {
  // AndyMark's gearbox ratios: "<n> Stage - <ratio> Ratio[ <more>]".
  const staged = value.match(/^(\d+)\s*Stages?\s*-\s*(\d+(?:\.\d+)?:\d+(?:\.\d+)?)\s*Ratio\b\s*(.*)$/i);
  if (staged) {
    const more = staged[3].trim();
    return { label: ratios(staged[2]), sub: [stages(Number(staged[1])), more && ratios(more)].filter(Boolean).join(", ") };
  }
  return { label: ratios(value), sub: null };
}

/** A ratio label's number ("6:1" → 6), else null. */
function ratioOf(label: string): number | null {
  const m = label.match(/^(\d+(?:\.\d+)?):1$/);
  return m ? Number(m[1]) : null;
}

/** Values in reading order: ratios by their number (4.77:1 before 12:1, whatever the stages), the rest as everywhere. */
export function compareDisplay(a: string, b: string): number {
  const ra = ratioOf(optionDisplay(a).label);
  const rb = ratioOf(optionDisplay(b).label);
  if (ra !== null && rb !== null && ra !== rb) return ra - rb;
  return compareOptionValues(a, b);
}

/** Groups with this many values or more than this many letters in a label become one searchable field. */
export const CHIP_LIMIT = 8;
export const LABEL_LIMIT = 12;

/**
 * Whether a group is shown as a searchable list instead of chips: more than 8 values, or
 * long labels in a group of more than three (three long chips still fit two rows).
 */
export function isLargeGroup(labels: string[]): boolean {
  return labels.length > CHIP_LIMIT || (labels.length > 3 && labels.some((l) => l.length > LABEL_LIMIT));
}

/** Small groups first (the belt's width before its 54 teeth); otherwise the supplier's order. */
export function orderGroups<G>(groups: G[], large: (g: G) => boolean): G[] {
  return [...groups.filter((g) => !large(g)), ...groups.filter(large)];
}
