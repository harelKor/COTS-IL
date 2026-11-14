/**
 * Reads the sizes out of a flat supplier title, so "12t Steel Spur Gear (20 DP,
 * 8mm SplineXS Bore)" becomes the family "Steel Spur Gear (20 DP)" with the
 * options teeth = 12t and bore = 8mm SplineXS. Things that define the family
 * (DP, belt pitch, material) stay in the title.
 */

/**
 * In display order. "cd" is a gear's center distance: a 14t gear for a 16t CD is a different part.
 * "awg" and "color" are a wire's gauge and colour ("18AWG Black Thin Insulation Wire").
 */
export const OPTION_KEYS = ["teeth", "cd", "bore", "id", "od", "width", "length", "awg", "color"] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];
export type Options = Partial<Record<OptionKey, string>>;

export type Spec = { key: string; value: string; num: number | null; unit: string | null };

export type ParsedTitle = {
  /** The title with the option tokens taken out, tidied. */
  familyTitle: string;
  /** familyTitle normalised for matching. Empty when nothing was left. */
  key: string;
  options: Options;
  /** Every size and spec found, options included, for the spec filters. */
  specs: Spec[];
};

/** Suppliers that resell another brand's parts put its name first ("WCP 44t …"). */
const BRAND_PREFIX = /^(WCP|AndyMark|CTRE|REV|Thrifty Bot|TTB)\s+/i;

// A size: 1-1/2", 3/8", .500", 0.375", 2", 0.192 in., 13.75mm, 9 mm, #10-32.
const INCH = String.raw`(?:\d+-\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)(?:"|\s?in\.)`;
const MM = String.raw`\d+(?:\.\d+)?\s?mm`;
const THREAD = String.raw`#\d+-\d+`;
const SIZE = `(?:${INCH}|${MM}|${THREAD})`;
// Shapes that follow a size: 1/2" Hex, 8mm SplineXS, 3/8" Rounded Hex.
const SHAPE = String.raw`(?:Rounded Hex|Hex|Round|SplineXS|SplineXL|Spline|Key|Square|D)`;
const SIZED = String.raw`${SIZE}(?:\s\(${SIZE}\s${SHAPE}\))?(?:\s${SHAPE})?`;
// Bores named after a motor or a spline rather than a size: "Falcon Bore", "SplineXL Bore".
const NAMED_BORE = String.raw`(?:${SIZE}\s)?(?:SplineXS|SplineXL|Falcon|Kraken|MiniCIM|CIM|BAG|NEO|Vortex|RS550\/775|RS775|RS550|Thunderhex|Rounded Hex|Hex|Round|Key)`;
const BARE_DECIMAL = String.raw`\d*\.\d+`;

/** `needs`: the rule only applies once that option was found ("Black" is a colour only after "18AWG"). */
type Rule = { key: OptionKey; pattern: RegExp; needs?: OptionKey };

const WIRE_COLOR = "Black|Red|White|Green|Yellow|Blue|Orange|Brown|Gr[ae]y";

/** Order matters: each rule takes its text out before the next one looks. */
const RULES: Rule[] = [
  // Wire sold one gauge and colour per listing, gauge first: "18AWG Black Thin Insulation Wire (25-feet)".
  { key: "awg", pattern: new RegExp(String.raw`^\s(\d+\s?AWG)\s(?=(?:${WIRE_COLOR})\b)`, "i") },
  { key: "color", pattern: new RegExp(String.raw`^\s*(${WIRE_COLOR})\b`, "i"), needs: "awg" },
  { key: "cd", pattern: /\b(\d+t)\s(?:CD|Center Distance)\b/i },
  { key: "id", pattern: new RegExp(String.raw`(${SIZED}|SplineXS|SplineXL)\sID\b`, "i") },
  { key: "od", pattern: new RegExp(String.raw`(${SIZED}|SplineXS|SplineXL)\sOD\b`, "i") },
  { key: "width", pattern: new RegExp(String.raw`(?:\bx\s)?(${SIZE})\s(?:WD|Wide|Width)\b`, "i") },
  { key: "length", pattern: new RegExp(String.raw`(${SIZE})\s(?:L|Long|Length)\b`, "i") },
  // Stock sold by length: "(36")" or "(Oversized 1/2" Hex, 6")".
  { key: "length", pattern: new RegExp(String.raw`[(,]\s?(${INCH})\)`, "i") },
  // Not a pair like "42t/28t" or a range like "155t-200t": those name the part, not a size.
  { key: "teeth", pattern: /(?<![/-])\b(\d+)\s?(?:t|T|Tooth)\b(?![-/]\d)/ },
  { key: "bore", pattern: new RegExp(String.raw`(${SIZED}|${NAMED_BORE}|${BARE_DECIMAL})\sBore\b`, "i") },
];

function inches(text: string): number | null {
  const t = text.replace(/"|\s?in\./g, "").trim();
  const mixed = t.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Splits "13.75mm" into 13.75 mm, '3/8"' into 0.375 in and "36t" into 36 t. Anything else has no number. */
export function measure(value: string): { num: number | null; unit: string | null } {
  const mm = value.match(/^(\d+(?:\.\d+)?)\s?mm\b/i);
  if (mm) return { num: Number(mm[1]), unit: "mm" };
  const inch = value.match(new RegExp(`^${INCH}`, "i"));
  if (inch) return { num: inches(inch[0]), unit: "in" };
  const teeth = value.match(/^(\d+)t$/);
  if (teeth) return { num: Number(teeth[1]), unit: "t" };
  return { num: null, unit: null };
}

/** Facts that stay in the family title but are worth filtering on. */
function titleSpecs(title: string): Spec[] {
  const specs: Spec[] = [];
  const dp = title.match(/\b(\d+)\s?DP\b/i);
  if (dp) specs.push({ key: "dp", value: `${dp[1]} DP`, num: Number(dp[1]), unit: "DP" });
  const chain = title.match(/#(25|35)\s?(?:Chain|Series)/i);
  const belt = title.match(/\b(GT2|HTD)\b/i);
  if (chain) specs.push({ key: "pitch", value: `#${chain[1]} Chain`, num: null, unit: null });
  else if (belt) specs.push({ key: "pitch", value: belt[1].toUpperCase() === "GT2" ? "GT2 3mm" : "HTD 5mm", num: null, unit: null });
  const material = title.match(/\b(Aluminum|Steel|Stainless|Bronze|Brass|Plastic|Nylon|Polycarbonate|Delrin)\b/i);
  if (material) specs.push({ key: "material", value: material[1], num: null, unit: null });
  if (/\bflanged\b/i.test(title)) specs.push({ key: "flanged", value: "yes", num: null, unit: null });
  return specs;
}

/** AndyMark writes "0.375 in." where WCP writes '0.375"'. */
function normalizeSize(value: string): string {
  return value
    .replace(/(\d)\s?in\./gi, '$1"')
    .replace(/(\d)\s+mm\b/gi, "$1mm")
    .replace(/\s+/g, " ")
    .trim();
}

/** Removes leftovers like "()", " x ", ", ," and trailing commas once the tokens are out. */
function tidy(text: string): string {
  let t = text;
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\(\s*[,\s]*\)/g, "")
      .replace(/\(\s*,\s*/g, "(")
      .replace(/\s*,\s*\)/g, ")")
      .replace(/,\s*,/g, ",")
      .replace(/(^|\s)x(\s+x)+(?=\s|$)/gi, "$1x")
      .replace(/^\s*[x,]\s+/i, "")
      .replace(/\s+[x,]\s*$/i, "")
      .replace(/\(\s*x\s+/gi, "(")
      .replace(/\s+x\s*\)/gi, ")")
      .replace(/\s+x\s+\(/gi, " (")
      .replace(/\s+,/g, ",")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  t = t.replace(/^[,\s]+|[,\s]+$/g, "");
  // "(Flanged Bearing)" once the sizes are gone, or "(Bronze Flanged Bushing) (6-Pack)".
  return t.replace(/^\(([^()]+)\)(?=\s*(\(|$))/, "$1").trim();
}

/** The title normalised for matching: case, quotes, punctuation and "20DP" vs "20 DP" don't count. */
export function familyKey(familyTitle: string): string {
  return familyTitle
    .toLowerCase()
    .replace(/(\d)\s?dp\b/g, "$1 dp")
    .replace(/["'’]/g, "")
    .replace(/[^a-z0-9#/.]+/g, " ")
    .trim();
}

export function parseTitle(title: string): ParsedTitle {
  let rest = ` ${title.replace(BRAND_PREFIX, "").replace(/\s+/g, " ").trim()} `;
  const options: Options = {};
  const specs: Spec[] = titleSpecs(rest);

  for (const rule of RULES) {
    if (options[rule.key] || (rule.needs && !options[rule.needs])) continue;
    const match = rest.match(rule.pattern);
    if (!match || match.index === undefined) continue;
    const value = normalizeSize(match[1]);
    if (!value) continue;
    // Keep the bracket or comma the match started with, so the title still reads,
    // unless the match also took the closing bracket: "(36")" goes, ", 6")" leaves ")".
    const lead = match[0].match(/^[(,]/)?.[0] ?? "";
    const closed = match[0].endsWith(")");
    const keep = closed ? (lead === "," ? ")" : "") : lead;
    rest = `${rest.slice(0, match.index)}${keep} ${rest.slice(match.index + match[0].length)}`;
    const stored =
      rule.key === "teeth" || rule.key === "cd" ? value.replace(/t?$/, "t") : rule.key === "awg" ? value.replace(/\s+/g, "").toUpperCase() : value;
    options[rule.key] = stored;
    specs.push({ key: rule.key, value: stored, ...measure(stored) });
  }

  const familyTitle = tidy(rest);
  return { familyTitle, key: familyKey(familyTitle), options, specs };
}

export type ListedOption = { name: string; value: string };

/**
 * A listing that names its options in its title, as AndyMark's combined listings do, one
 * product per combination: "SDS MK4i Swerve Modules - Motor Pinion Type:Falcon Spline,
 * Gear Ratio:L3 6.12:1, Wheel Type:Colson Wheel". Returns the title before " - " and the
 * options; null for any other title. A value may hold a colon ("L3 6.12:1") or a comma
 * ("L1, L2, L3"): only ", Name:" starts the next option.
 */
export function splitOptionTitle(title: string): { base: string; options: ListedOption[] } | null {
  const NAME = String.raw`[A-Za-z#][A-Za-z0-9#*/() ]{0,40}`;
  const match = title.match(new RegExp(String.raw`^(.+?) - (${NAME}:.+)$`));
  if (!match) return null;
  const options = match[2].split(new RegExp(String.raw`, (?=${NAME}:)`)).map((part) => {
    const at = part.indexOf(":");
    return { name: part.slice(0, at).trim(), value: part.slice(at + 1).trim() };
  });
  if (options.some((o) => !o.name || !o.value)) return null;
  return { base: match[1].trim(), options };
}
