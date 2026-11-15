import { BORE_SHAPES, BORE_WORDS, MATERIAL_ALIASES, MOTOR_ALIASES, NAMED_BORES, SHAPELESS_KEEP, SPEC_KEY_ALIASES } from "./spec-aliases";
import { leadingSize, normalizeSizes, sizeOf, type Size } from "./units";

/**
 * One written form per spec value (CF1), so the catalog's filters list `1/2" Hex` once
 * however each supplier spells it. Runs at regroup on every spec before it's stored in
 * `spec_values`, and on the filter values read from a URL, so an old link still works.
 * The product page's option labels stay as the supplier wrote them.
 */

/** Where a value came from: the variant's own option, the product's title, or its description. */
export type SpecSource = "option" | "title" | "description";
export type NormalSpec = { key: string; value: string; num: number | null; unit: string | null };

const clean = (text: string) =>
  text
    .replace(/[®™©]/g, "")
    .replace(/[“”″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const spec = (key: string, value: string, num: number | null = null, unit: string | null = null): NormalSpec => ({ key, value, num, unit });

/** Motors named in a text, as MOTOR_ALIASES labels them, each once. */
export function motorsIn(text: string): string[] {
  const t = clean(text);
  const found: string[] = [];
  for (const { pattern, motor } of MOTOR_ALIASES) if (pattern.test(t) && !found.includes(motor)) found.push(motor);
  return found;
}

/** The bore shape a text names, or null. */
function shapeIn(text: string): string | null {
  for (const { pattern, shape } of BORE_SHAPES) if (pattern.test(text)) return shape;
  return null;
}

/** "8mm Round", '1/2" Hex', or the size alone for SHAPELESS_KEEP. */
function boreLabel(size: Size, shape: string | null): string {
  if (shape) return `${size.label} ${shape}`;
  return SHAPELESS_KEEP.has(size.label) ? size.label : `${size.label} Round`;
}

/**
 * A bore: a named spline (`Falcon Spline`, `SplineXS`), or a size and shape (`1/2" Hex`,
 * `8mm Round`, `6mm D`), plus any motor it names as `motor-fit` specs. A motor alone
 * (`RS775`, `BAG`) is only a motor. A shape with no size takes it from `hint` (the title)
 * when that names the same shape, and is dropped otherwise.
 */
export function normalizeBore(raw: string, hint?: string): NormalSpec[] {
  let t = clean(raw)
    .replace(/\bwith\s+counterbore\b/gi, "")
    .replace(/\((?:[^()]*\b(?:OD|compatible|for)\b[^()]*)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const motors = motorsIn(t).map((m) => spec("motor-fit", m));

  for (const { pattern, bore } of BORE_WORDS) if (pattern.test(t)) return [...(bore ? [spec("bore", bore)] : []), ...motors];

  for (const { pattern, bore } of NAMED_BORES) {
    const match = t.match(pattern);
    if (match) return [spec("bore", match[0].replace(pattern, bore)), ...motors];
  }

  t = t
    .replace(/\b(?:bearing\s+)?bore\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\s-]+$/, "")
    .trim();
  // "375 Hex" and "500 Hex": thousandths of an inch.
  const thousandths = t.match(/^(\d{3})\s+((?:Rounded\s+)?(?:Hex|Round)\b.*)$/i);
  const inner = t.search(/\d+(?:\.\d+)?\s?mm\b|\d+(?:\/\d+)?(?:"|\s?in\.?\s)/i);
  const lead = thousandths
    ? { size: sizeOf(Number(thousandths[1]) / 1000, "in"), rest: thousandths[2] }
    : (plausible(leadingSize(t, { bareInches: true })) ?? (inner > 0 ? leadingSize(t.slice(inner)) : null));
  if (lead) {
    const shape = shapeIn(lead.rest);
    if (!shape && hint) {
      const fromHint = boreFromText(hint).find((s) => s.key === "bore");
      if (fromHint && fromHint.value.startsWith(`${lead.size.label} `)) return [fromHint, ...motors];
    }
    return [spec("bore", boreLabel(lead.size, shape), lead.size.num, lead.size.unit), ...motors];
  }

  // A motor's name used as the bore: only the motor.
  if (motors.length > 0) return motors;

  const shape = shapeIn(t);
  if (shape && hint) {
    const fromHint = boreFromText(hint).find((s) => s.key === "bore" && s.value.endsWith(` ${shape}`));
    if (fromHint) return [fromHint];
  }
  if (shape) return [];
  // Something we don't know ("24mm Pocket"): kept as written, tidied, so it can be mapped later.
  return t ? [spec("bore", normalizeSizes(t))] : [];
}

/** A bare number is a bore in inches only when it could be one: "550" is a motor, not 550". */
function plausible(found: ReturnType<typeof leadingSize>) {
  return found && (found.size.unit !== "in" || found.size.num < 4) ? found : null;
}

const BORE_TAIL = new RegExp(
  // A size that starts a word: "RS550/775 Bore" names motors, not a 550/775" bore.
  String.raw`((?<![\w./])(?:\d+[-\s]\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)(?:"|\s?(?:in\.?|inch(?:es)?|mm)(?![a-z]))?[\s-]*)?` +
    String.raw`((?:\b(?:Rounded|Round|Hex|Thunderhex|Keyed|Key|D|REX|Square|SplineXS|SplineXL|MAXSpline|Spline|Falcon|Kraken|Servo|\d+\s?T)\b[\s-]*){0,3})` +
    String.raw`(?:Bearing\s*)?$`,
  "i",
);

/** Bores a title or description names before the word "Bore": "(6mm D-Bore)", "3/8 Hex Bore", "Kraken Bore". */
export function boreFromText(text: string): NormalSpec[] {
  const t = clean(text);
  for (const match of t.matchAll(/\bBore\b/gi)) {
    const before = t.slice(0, match.index).replace(/[\s-]+$/, " ");
    const tail = before.match(BORE_TAIL);
    if (!tail || !tail[0].trim()) continue;
    const found = normalizeBore(tail[0].trim());
    if (found.some((s) => s.key === "bore")) return found;
  }
  // REV's "14T (16T C-C) - 1/2in Rounded Hex - 20DP Gear": a part of its own that is only a bore.
  for (const part of t.split(/\s[-–]\s/).slice(1)) {
    const p = part.trim();
    if (!BORE_SEGMENT.test(p) && !NAMED_BORES.some(({ pattern }) => new RegExp(`^${pattern.source}$`, "i").test(p))) continue;
    const found = normalizeBore(p);
    if (found.some((s) => s.key === "bore")) return found;
  }
  return [];
}

const BORE_SEGMENT = /^(?:\d+\/\d+|\d*\.\d+|\d+)\s?(?:"|in\.?|inch|mm)\s?(?:Rounded Hex|Hex|Round|Keyed|Key|D|REX)$/i;

/** "12", "12t", "12 Tooth", "40 - Black" → `12T`; "10 Tooth 1/2" Hex Bore" also gives the bore. */
export function normalizeTeeth(raw: string): NormalSpec[] {
  const t = clean(raw);
  const match = t.match(/^(\d+)\s?(?:t|tooth|teeth)?\b/i);
  if (!match) return [];
  const n = Number(match[1]);
  if (n <= 0) return [];
  return [spec("teeth", `${n}T`, n, "T"), ...boreFromText(t.slice(match[0].length))];
}

/** "20 DP", "20DP", "20 DP, 14.5° PA" → `20 DP`; "0.6 MOD", "1.5 Module" → `module` `MOD 0.6`. */
export function normalizePitchSystem(raw: string): NormalSpec[] {
  const t = clean(raw);
  const dp = t.match(/\b(\d+)\s?DP\b/i);
  if (dp) return [spec("dp", `${Number(dp[1])} DP`, Number(dp[1]), "DP")];
  // "MOD 0.8" or "1.5 Module", whichever comes first: "0.48 Module 0.125 in. Round Bore" is MOD 0.48.
  const mod = [t.match(/\bMOD(?:ULE)?\s?(\d+(?:\.\d+)?)(?![\d./])/i), t.match(/(?<![\d./])(\d+(?:\.\d+)?)\s?(?:MOD|Module)\b/i)]
    // Robot gears run MOD 0.3 to 3; "6 Module Spares Bundle" is six swerve modules.
    .filter((m): m is RegExpMatchArray => m !== null && Number(m[1]) > 0 && Number(m[1]) <= 3)
    .sort((a, b) => a.index! - b.index!)[0];
  if (mod) return [spec("module", `MOD ${Number(mod[1])}`, Number(mod[1]), "MOD")];
  return [];
}

/** Chain and belt pitch: `#25 Chain`, `GT2 3mm`, `HTD 5mm`; anything else as a size. */
export function normalizeBeltPitch(raw: string): NormalSpec[] {
  const t = clean(raw);
  const chain = t.match(/^#?(25|35|40)\b/);
  if (chain) return [spec("pitch", `#${chain[1]} Chain`)];
  if (/\bGT2\b/i.test(t)) return [spec("pitch", "GT2 3mm")];
  if (/\bHTD\b/i.test(t)) return [spec("pitch", "HTD 5mm")];
  return normalizeMeasure("pitch", t);
}

/**
 * A length, width or diameter: one size in its one form (`1/2"`, `0.192"`, `8mm`). REV's
 * "(REV-21-2004-PK10) 1/2in Hex Shaft Spacer - 1/8in - 10 Pack" is the part's size, `1/8"`.
 * Text that isn't a plain size keeps its words with the sizes in it rewritten.
 */
export function normalizeMeasure(key: string, raw: string): NormalSpec[] {
  const t = clean(raw).replace(/^\([A-Z0-9-]+\)\s*/i, "");
  if (!t) return [];
  const whole = leadingSize(t);
  if (whole && (/^\s*(?:long|length|wide|width|thick|l|w)?\s*$/i.test(whole.rest) || (key === "length" && /^\s*long\b/i.test(whole.rest)))) {
    return [spec(key, whole.size.label, whole.size.num, whole.size.unit)];
  }
  if (/\s-\s/.test(t)) {
    const parts = t.split(/\s-\s/).map((p) => p.trim());
    for (const part of parts.slice(1).reverse()) {
      const size = leadingSize(part);
      if (size && /^\s*(?:\(.*\))?\s*$/.test(size.rest)) return [spec(key, size.size.label, size.size.num, size.size.unit)];
    }
  }
  return [spec(key, normalizeSizes(t), whole?.size.num ?? null, whole?.size.unit ?? null)];
}

/** The material a text names first (`Steel`, `Aluminum`), or nothing. */
export function normalizeMaterial(raw: string): NormalSpec[] {
  const t = clean(raw);
  let best: { at: number; material: string } | null = null;
  for (const { pattern, material } of MATERIAL_ALIASES) {
    const at = t.search(pattern);
    if (at >= 0 && (!best || at < best.at)) best = { at, material };
  }
  return best ? [spec("material", best.material)] : t ? [spec("material", t)] : [];
}

const MEASURE_KEYS = new Set(["width", "length", "id", "od", "thickness", "diameter", "height"]);

/**
 * One spec as stored: its key (after SPEC_KEY_ALIASES) and value in their one form. May
 * give more than one (a bore that names a motor) or none (a bare "Hex" with no size).
 * `hint` is the product's title, for a bore that gives only its shape.
 */
export function normalizeSpec(key: string, value: string, hint?: string): NormalSpec[] {
  const k = SPEC_KEY_ALIASES[key] ?? key;
  const v = clean(value);
  if (!v) return [];
  switch (k) {
    case "bore":
      return normalizeBore(v, hint);
    case "motor-fit":
      return motorsIn(v).map((m) => spec("motor-fit", m));
    case "teeth":
      return normalizeTeeth(v);
    case "cd": {
      const n = v.match(/^(\d+)\s?(?:t|tooth)?\b/i);
      return n ? [spec("cd", `${Number(n[1])}T`, Number(n[1]), "T")] : [];
    }
    case "dp":
    case "module":
      return normalizePitchSystem(v);
    case "pitch":
      return normalizeBeltPitch(v);
    case "material":
      return normalizeMaterial(v);
    default:
      if (MEASURE_KEYS.has(k)) return normalizeMeasure(k, v);
      {
        const lead = leadingSize(v);
        return [spec(k, v, lead?.size.num ?? null, lead?.size.unit ?? null)];
      }
  }
}

/**
 * A filter value from the URL in its stored form, so `?s.bore=1/2 in. Hex` finds the
 * `1/2" Hex` gears. A motor under bore (`?s.bore=RS775`) moves to `motor-fit`.
 */
export function normalizeFilterValue(key: string, value: string): { key: string; value: string } {
  const [first] = normalizeSpec(key, value);
  return first ? { key: first.key, value: first.value } : { key, value };
}
