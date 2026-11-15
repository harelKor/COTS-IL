/**
 * Sizes in one written form, so a filter value means one thing whoever wrote it:
 * '0.500"', ".5 in.", "1/2in" and '1/2 in' are all `1/2"`; "8 mm" is `8mm`. Inch sizes
 * that are a common fraction are written as one (the FRC way), others as a trimmed
 * decimal (`0.192"`). Metric stays metric.
 */

export type Unit = "in" | "mm" | "ft";
export type Size = { num: number; unit: Unit; label: string };

const FRACTION_DENOMINATORS = [2, 4, 8, 16, 32];
/** Suppliers round 3/16 to .188 and 5/16 to .313: a size this close to a fraction is that fraction. */
const FRACTION_TOLERANCE = 0.0006;

/** 0.375 → "3/8", 1.125 → "1-1/8", 2 → "2", 0.192 → "0.192". */
export function formatInchNumber(value: number): string {
  const whole = Math.floor(value + FRACTION_TOLERANCE);
  const rest = value - whole;
  if (Math.abs(rest) < FRACTION_TOLERANCE) return String(whole);
  for (const d of FRACTION_DENOMINATORS) {
    const n = Math.round(rest * d);
    if (n > 0 && n < d && Math.abs(rest - n / d) < FRACTION_TOLERANCE) return whole > 0 ? `${whole}-${n}/${d}` : `${n}/${d}`;
  }
  return trimDecimal(value);
}

function trimDecimal(value: number): string {
  return String(Number(value.toFixed(4)));
}

export function formatSize(num: number, unit: Unit): string {
  if (unit === "in") return `${formatInchNumber(num)}"`;
  if (unit === "mm") return `${trimDecimal(num)}mm`;
  return `${trimDecimal(num)} ft`;
}

/** "1-1/2", "1 1/2", "3/8", ".500", "0.375", "2" as a number. */
function readNumber(text: string): number | null {
  const t = text.trim();
  const mixed = t.match(/^(\d+)[-\s](\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? n : null;
}

const NUMBER = String.raw`(?:\d+[-\s]\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`;
const INCH_UNIT = String.raw`(?:"|”|''|\s?(?:in\.?|inch(?:es)?)(?![a-z]))`;
const MM_UNIT = String.raw`\s?mm(?![a-z])`;
const CM_UNIT = String.raw`\s?cm(?![a-z])`;
const FT_UNIT = String.raw`\s?(?:ft\.?|foot|feet)(?![a-z])`;

/** One size anywhere in a text: the number and its unit, or a fraction with no unit (inches). */
export const SIZE_PATTERN = new RegExp(
  String.raw`(?<![\w./#-])(${NUMBER})(${INCH_UNIT}|${MM_UNIT}|${CM_UNIT}|${FT_UNIT})`,
  "gi",
);

function unitOf(suffix: string): { unit: Unit; scale: number } {
  const s = suffix.trim().toLowerCase();
  if (s === "mm") return { unit: "mm", scale: 1 };
  if (s === "cm") return { unit: "mm", scale: 10 };
  if (/^(ft\.?|foot|feet)$/.test(s)) return { unit: "ft", scale: 1 };
  return { unit: "in", scale: 1 };
}

/**
 * A size at the start of `text` ('0.500" Hex' → 1/2" and the rest " Hex"). A bare number
 * counts as inches only when `bareInches` says so (a bore of ".875" or "1/2 Hex").
 */
export function leadingSize(text: string, { bareInches = false } = {}): { size: Size; rest: string } | null {
  const t = text.trimStart();
  const withUnit = t.match(new RegExp(String.raw`^(${NUMBER})(${INCH_UNIT}|${MM_UNIT}|${CM_UNIT}|${FT_UNIT})`, "i"));
  if (withUnit) {
    const n = readNumber(withUnit[1]);
    if (n === null) return null;
    const { unit, scale } = unitOf(withUnit[2]);
    return { size: sizeOf(n * scale, unit), rest: t.slice(withUnit[0].length) };
  }
  if (!bareInches) return null;
  const bare = t.match(new RegExp(String.raw`^(${NUMBER})(?![\w.:/])`));
  if (!bare) return null;
  const n = readNumber(bare[1]);
  if (n === null || n <= 0) return null;
  return { size: sizeOf(n, "in"), rest: t.slice(bare[0].length) };
}

export function sizeOf(num: number, unit: Unit): Size {
  return { num: Number(num.toFixed(4)), unit, label: formatSize(num, unit) };
}

/** Every size in a text rewritten in its one form: '0.375" ID x .875" OD' → '3/8" ID x 7/8" OD'. */
export function normalizeSizes(text: string): string {
  return text.replace(SIZE_PATTERN, (match, num: string, suffix: string) => {
    const n = readNumber(num);
    if (n === null) return match;
    const { unit, scale } = unitOf(suffix);
    return formatSize(n * scale, unit);
  });
}

/** A number to sort by across units: sizes in millimetres, anything else as it is. */
export function sortValue(num: number | null, unit: string | null): number | null {
  if (num === null) return null;
  if (unit === "in") return num * 25.4;
  if (unit === "ft") return num * 304.8;
  return num;
}
