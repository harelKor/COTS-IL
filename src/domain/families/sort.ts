import { measure } from "./parse";

/**
 * Hebrew column names for the option keys the parser and the suppliers use.
 * Keys are in the normalized form `normalizeOptionKey` produces: lowercase words separated by spaces.
 */
export const OPTION_LABELS: Record<string, string> = {
  // Gears, pulleys and sprockets
  teeth: "שיניים",
  tooth: "שיניים",
  "tooth count": "מס׳ שיניים",
  "teeth count": "מס׳ שיניים",
  pinion: "פיניון",
  "pinion teeth": "שיני פיניון",
  gear: "גלגל שיניים",
  pulley: "גלגלת",
  sprocket: "גלגל שרשרת",
  belt: "רצועה",
  chain: "שרשרת",
  cd: "מרחק צירים",
  "center distance": "מרחק צירים",
  dp: "DP",
  "diametral pitch": "DP",
  pitch: "פסיעה",
  ratio: "יחס העברה",
  "gear ratio": "יחס העברה",
  reduction: "יחס העברה",
  stages: "שלבים",
  // Sizes
  bore: "קדח",
  id: "קוטר פנימי",
  "inner diameter": "קוטר פנימי",
  od: "קוטר חיצוני",
  "outer diameter": "קוטר חיצוני",
  diameter: "קוטר",
  width: "רוחב",
  length: "אורך",
  height: "גובה",
  thickness: "עובי",
  depth: "עומק",
  size: "מידה",
  dimensions: "מידות",
  angle: "זווית",
  weight: "משקל",
  // Shafts, fasteners and mounting
  shaft: "ציר",
  hex: "משושה",
  axle: "ציר",
  thread: "הברגה",
  threads: "הברגה",
  "thread size": "מידת הברגה",
  "screw size": "מידת בורג",
  mounting: "הרכבה",
  mount: "הרכבה",
  "mounting pattern": "דפוס הרכבה",
  "hole pattern": "דפוס חורים",
  flanged: "עם אוגן",
  // Wheels
  wheel: "גלגל",
  tread: "משטח מגע",
  durometer: "קשיות",
  hardness: "קשיות",
  // Material and look
  material: "חומר",
  color: "צבע",
  colour: "צבע",
  finish: "גימור",
  "color finish": "צבע וגימור",
  // Motors and electrical
  motor: "מנוע",
  motors: "מס׳ מנועים",
  "motor count": "מס׳ מנועים",
  voltage: "מתח",
  volts: "מתח",
  current: "זרם",
  amperage: "זרם",
  power: "הספק",
  connector: "מחבר",
  "connector type": "סוג מחבר",
  gauge: "עובי חוט",
  "wire gauge": "עובי חוט",
  awg: "עובי חוט",
  wire: "חוט",
  cable: "כבל",
  encoder: "אנקודר",
  speed: "מהירות",
  rpm: "סל״ד",
  // Packaging
  pack: "כמות באריזה",
  "pack size": "כמות באריזה",
  "pack qty": "כמות באריזה",
  "pack quantity": "כמות באריזה",
  quantity: "כמות",
  qty: "כמות",
  count: "כמות",
  kit: "ערכה",
  // Generic Shopify option names
  option: "אפשרות",
  options: "אפשרות",
  version: "גרסה",
  variant: "גרסה",
  model: "דגם",
  title: "דגם",
  configuration: "תצורה",
  config: "תצורה",
  type: "סוג",
  style: "סגנון",
  side: "צד",
  direction: "כיוון",
  hand: "כיוון",
  orientation: "כיוון",
  year: "שנה",
  season: "עונה",
};

/** Trailing words that qualify another key ("shaft type", "wheel size"), in Hebrew construct form. */
const QUALIFIERS: Record<string, string> = {
  type: "סוג",
  size: "מידת",
  count: "מס׳",
  style: "סגנון",
};

/**
 * An option key as lowercase words: "# of Motors", "number-of-motors" and "of-motors" all become "motors".
 * Only for looking up labels; the stored keys stay as they are.
 */
export function normalizeOptionKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:#\s*|(?:number|num|no\.?)\s+)/, "")
    .replace(/^of\s+/, "");
}

/** Known keys in Hebrew; anything else, a supplier's own option name ("gear-ratio"), as words. */
export function optionLabel(key: string): string {
  const k = normalizeOptionKey(key);
  const known = OPTION_LABELS[k];
  if (known) return known;

  // "shaft type" → "סוג ציר", "wheel size" → "מידת גלגל".
  const qualified = /^(.+) (type|size|count|style)$/.exec(k);
  if (qualified && OPTION_LABELS[qualified[1]]) return `${QUALIFIERS[qualified[2]]} ${OPTION_LABELS[qualified[1]]}`;

  // A plain plural ("colors", "materials").
  if (k.endsWith("s") && OPTION_LABELS[k.slice(0, -1)]) return OPTION_LABELS[k.slice(0, -1)];

  return key.replace(/-/g, " ");
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
