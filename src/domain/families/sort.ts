import { measure } from "./parse";

/** Hebrew column names for the option keys the parser and the suppliers use. */
export const OPTION_LABELS: Record<string, string> = {
  teeth: "שיניים",
  cd: "מרחק צירים",
  bore: "קדח",
  id: "קוטר פנימי",
  od: "קוטר חיצוני",
  width: "רוחב",
  length: "אורך",
  size: "מידה",
  color: "צבע",
  material: "חומר",
  dp: "DP",
  pitch: "פסיעה",
  flanged: "עם אוגן",
};

/** Known keys in Hebrew; a supplier's own option names ("gear-ratio") as words. */
export function optionLabel(key: string): string {
  return OPTION_LABELS[key] ?? key.replace(/-/g, " ");
}

/** Compares two option values: by size when both have one (9mm < 15mm, 12t < 100t), else alphabetically. */
export function compareOptionValues(a: string | undefined, b: string | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  const ma = measure(a);
  const mb = measure(b);
  if (ma.num !== null && mb.num !== null && ma.unit === mb.unit && ma.num !== mb.num) return ma.num - mb.num;
  return a.localeCompare(b, "en", { numeric: true });
}

/** Sorts a family's variants by its options in order, so 12t comes before 100t. */
export function sortByOptions<T extends { familyOptions: Record<string, string> }>(rows: T[], keys: string[]): T[] {
  return [...rows].sort((x, y) => {
    for (const k of keys) {
      const c = compareOptionValues(x.familyOptions[k], y.familyOptions[k]);
      if (c !== 0) return c;
    }
    return 0;
  });
}
