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
  cd: "מרחק צירים (שיניים)",
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
  "hole pattern": "תבנית חורים",
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
  // Vendor option names seen in the catalog (audit C-10, Nov 14, 2026)
  "motor pinion type": "סוג פיניון מנוע",
  "motor pinion gear options": "פיניון מנוע",
  "for motor shaft": "לציר מנוע",
  "stage a ratio": "יחס שלב א׳",
  "stage b ratio": "יחס שלב ב׳",
  stage: "שלב",
  assembled: "מורכב",
  layout: "פריסה",
  "mecanum wheel": "גלגל מקנום",
  "steering encoder": "אנקודר היגוי",
  gender: "זכר / נקבה",
  "tooth count length": "שיניים ואורך",
  plate: "פלטה",
  processor: "מעבד",
  wall: "דופן",
  profile: "פרופיל",
  "outside profile": "פרופיל חיצוני",
  "tooth profile": "פרופיל שן",
  extrusion: "פרופיל אלומיניום",
  "extrusion wall thickness": "עובי דופן הפרופיל",
  "2x1 wall thickness": "עובי דופן 2x1",
  shape: "צורה",
  "overall length of cable": "אורך כבל כולל",
  "length of red wire": "אורך החוט האדום",
  "power distribution": "חלוקת מתח",
  number: "מספר",
  wood: "עץ",
  "weight relief": "הקלת משקל",
  "weight relieved": "הקלת משקל",
  "gauge jacket and connector": "עובי חוט, בידוד ומחבר",
  "gauge and jacket": "עובי חוט ובידוד",
  tube: "צינור",
  tubing: "צינור",
  "nominal pipe size": "מידת צינור נומינלית",
  hardware: "ברגים",
  "motor hardware": "ברגים למנוע",
  "motor input hardware": "ברגים לכניסת המנוע",
  "mounting hardware": "ברגי הרכבה",
  output: "יציאה",
  "output shaft": "ציר יציאה",
  input: "כניסה",
  "motor input": "כניסת מנוע",
  "swerve x orientation": "כיוון המודול",
  "intended use": "שימוש מיועד",
  "for use with": "מתאים ל",
  "faces drilled": "פאות קדוחות",
  spacer: "מרווח",
  license: "רישיון",
  bearings: "מיסבים",
  bearing: "מיסב",
  "mounting method": "שיטת הרכבה",
  "mounting direction": "כיוון הרכבה",
  "mounting holes": "חורי הרכבה",
  "mounting style": "סגנון הרכבה",
  "flipped mounting style": "סגנון הרכבה הפוך",
  "torque setting": "כיוון מומנט",
  bank: "מערך",
  "torx plus size": "מידת Torx Plus",
  electronics: "אלקטרוניקה",
  "amp rating": "זרם נקוב",
  "current rating": "זרם נקוב",
  "speed controller": "בקר מהירות",
  controller: "בקר",
  leg: "רגל",
  valves: "מס׳ שסתומים",
  "additional items": "פריטים נוספים",
  "for of motors": "מס׳ מנועים",
  insulation: "בידוד",
  "pinion and connector": "פיניון ומחבר",
  "battery tools": "כלים לסוללה",
  battery: "סוללה",
  "analog feedback": "משוב אנלוגי",
  brand: "מותג",
  pronouns: "כינויי גוף",
  breaker: "מפסק",
  "field side": "צד המגרש",
  connection: "חיבור",
  "cable tie hole width": "רוחב חור לאזיקון",
  case: "מארז",
  "internal hex": "משושה פנימי",
  tip: "ראש",
  stroke: "מהלך",
  drive: "הנעה",
  pin: "פין",
  "pin options": "פינים",
  "power connector": "מחבר מתח",
  "length between sb connector and 120a breaker": "אורך בין מחבר SB למפסק 120A",
  "include accessories": "כולל אביזרים",
  accessories: "אביזרים",
  tote: "ארגז",
  turns: "סיבובים",
  set: "ערכה",
  amount: "כמות",
  "inside diameter": "קוטר פנימי",
  "outside diameter": "קוטר חיצוני",
  meter: "מד",
  "color and size": "צבע ומידה",
  "hole punch pattern": "תבנית חורים",
  hub: "רכזת",
  interface: "ממשק",
  "plug or sleeve": "תקע או שרוול",
  "select base kit": "ערכת בסיס",
  "base kit": "ערכת בסיס",
  module: "מודול",
};

/** Trailing words that qualify another key ("shaft type", "wheel size"), in Hebrew construct form. */
const QUALIFIERS: Record<string, string> = {
  type: "סוג",
  size: "מידת",
  count: "מס׳",
  style: "סגנון",
  length: "אורך",
  thickness: "עובי",
  diameter: "קוטר",
  width: "רוחב",
  configuration: "תצורת",
};

/** Vendor spellings of a word, to the word: AndyMark writes "Motor Pinon Type" beside "Motor Pinion Type". */
const TYPOS: Record<string, string> = { pinon: "pinion" };

/**
 * An option key as lowercase words: "# of Motors", "number-of-motors" and "of-motors" all become "motors".
 * Vendor typos are fixed ("motor pinon type" → "motor pinion type") and "stagea" splits into "stage a".
 * Only for looking up labels; the stored keys stay as they are.
 */
export function normalizeOptionKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:#\s*|(?:number|num|no\.?)\s+)/, "")
    .replace(/^of\s+/, "")
    .split(" ")
    .map((w) => TYPOS[w] ?? w.replace(/^stage([ab])$/, "stage $1"))
    .join(" ");
}

/** A Hebrew label for normalized words, or null. */
function hebrewLabel(k: string): string | null {
  const known = OPTION_LABELS[k];
  if (known) return known;

  // A plain plural ("colors", "materials").
  if (k.endsWith("s") && OPTION_LABELS[k.slice(0, -1)]) return OPTION_LABELS[k.slice(0, -1)];

  // "shaft type" → "סוג ציר", "cable length" → "אורך כבל", "wall thickness" → "עובי דופן".
  const qualified = /^(.+) (type|size|count|style|length|thickness|diameter|width|configuration)$/.exec(k);
  const head = qualified && hebrewLabel(qualified[1]);
  if (qualified && head) return `${QUALIFIERS[qualified[2]]} ${head}`;

  // "wheel option" → "גלגל", "motor hardware included" → "כולל ברגים למנוע".
  const option = /^(.+) options?$/.exec(k);
  if (option) return hebrewLabel(option[1]);
  const included = /^(.+) (?:included|installed)$/.exec(k);
  const what = included && hebrewLabel(included[1]);
  return what ? `כולל ${what}` : null;
}

/**
 * Known keys in Hebrew. A vendor's own long name that ends in a known one takes its label
 * ("wcp swerve x2 ratio set gear ratio" → "יחס העברה"); anything else is the vendor's words,
 * capitalised, never a raw lowercase key.
 */
export function optionLabel(key: string): string {
  const k = normalizeOptionKey(key);
  const label = hebrewLabel(k);
  if (label) return label;

  // The longest known ending: "wcp swerve x2 module mounting method" → "שיטת הרכבה".
  const words = k.split(" ");
  for (let i = 1; i < words.length; i++) {
    const tail = hebrewLabel(words.slice(i).join(" "));
    if (tail) return tail;
  }

  const text = key.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Spec names from suppliers' spec tables and "Name: value" lines that aren't option names.
 * Looked up whole: "Nominal Voltage" is מתח נומינלי, never just מתח beside a second מתח.
 */
export const SPEC_LABELS: Record<string, string> = {
  "free speed": "מהירות חופשית",
  "free current": "זרם ללא עומס",
  "stall torque": "מומנט עצירה",
  "stall current": "זרם עצירה",
  torque: "מומנט",
  "peak power": "הספק שיא",
  "max power": "הספק מרבי",
  "maximum power": "הספק מרבי",
  efficiency: "נצילות",
  "max efficiency": "נצילות מרבית",
  "peak efficiency": "נצילות מרבית",
  "nominal voltage": "מתח נומינלי",
  "operating voltage": "מתח הפעלה",
  "supply voltage": "מתח אספקה",
  "input voltage": "מתח כניסה",
  "min/max voltage": "טווח מתח",
  "voltage range": "טווח מתח",
  "max current": "זרם מרבי",
  "maximum current": "זרם מרבי",
  "continuous current": "זרם רציף",
  "rated current": "זרם נקוב",
  "communication protocols": "פרוטוקולי תקשורת",
  "communication protocol": "פרוטוקול תקשורת",
  communication: "תקשורת",
  resolution: "רזולוציה",
  "encoder resolution": "רזולוציית אנקודר",
  "sample rate": "קצב דגימה",
  "update rate": "קצב עדכון",
  range: "טווח",
  accuracy: "דיוק",
  "field of view": "שדה ראייה",
  "operating temperature": "טמפרטורת עבודה",
  temperature: "טמפרטורה",
  mass: "משקל",
  "net weight": "משקל נטו",
  "bolt circle": "מעגל ברגים",
  "bolt pattern": "תבנית ברגים",
  "pressure angle": "זווית לחץ",
  capacity: "קיבולת",
  "max load": "עומס מרבי",
  "load rating": "עומס מותר",
  compatibility: "תאימות",
  "compatible with": "מתאים ל",
  "kit contents": "תכולת הערכה",
  includes: "כולל",
  included: "כולל",
  warranty: "אחריות",
};

/**
 * A spec's name in Hebrew when we know it whole, else the supplier's own words as written
 * (shown left to right), never half translated: "PWM Deadband" stays "PWM Deadband", not
 * "PWM" beside a Hebrew word. A unit in brackets doesn't stop the lookup ("Weight (lbs)").
 */
export function specLabel(key: string): string {
  const k = normalizeOptionKey(key.replace(/\s*\([^)]*\)\s*$/, ""));
  return SPEC_LABELS[k] ?? hebrewLabel(k) ?? key.replace(/\s+/g, " ").trim();
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
