/**
 * The reviewed alias table behind the spec filters: how each supplier's words map to one
 * value. A new supplier's spelling is mapped by adding a row here, not by editing the
 * normalizers. Every row has a case in spec-aliases.test.ts.
 */

/**
 * Option keys (after `optionKey` in families/group.ts) whose values are read as another
 * spec. "motor-pinion-type" holds "Falcon Spline" or "NEO 8mm Key", which is a bore (and
 * a motor); "tooth-profile" holds "20 DP, 14.5° PA". The option itself is unchanged on the
 * product page; only the filter values move.
 */
export const SPEC_KEY_ALIASES: Record<string, string> = {
  motor: "motor-fit",
  "bore-size": "bore",
  "hub-bore": "bore",
  "bore-type": "bore",
  "tooth-count": "teeth",
  "number-of-teeth": "teeth",
  "teeth-count": "teeth",
  "belt-size": "teeth",
  "motor-pinion-type": "bore",
  "motor-hardware": "bore",
  "motor-input-hardware": "bore",
  "motor-input": "bore",
  "tooth-profile": "dp",
  "diametral-pitch": "dp",
  "chain-size": "pitch",
  "inner-diameter": "id",
  "outer-diameter": "od",
};

/**
 * Option keys whose values describe the whole part in a few words ("14T (16T C-C) - 1/2in
 * Rounded Hex - 20DP Gear", "(REV-41-1331-PK8) 15 Tooth Plastic Gear - 8 Pack"). They're
 * read like a title for the DP, teeth and bore the variant doesn't already have.
 */
export const DESCRIPTIVE_KEYS = new Set(["type", "size", "option", "style", "pinion", "pinion-type", "pulley-type"]);

/** Motors, as the "motor-fit" filter (התאמה למנוע) names them. First match wins; one text can name several. */
export const MOTOR_ALIASES: { pattern: RegExp; motor: string }[] = [
  { pattern: /\b775\s?pro\b/i, motor: "775pro" },
  { pattern: /\bRS[-\s]?550\s?\/\s?775\b/i, motor: "RS550" },
  { pattern: /\bRS[-\s]?550\s?\/\s?775\b/i, motor: "RS775" },
  { pattern: /\b550\s?(?:and|&|\/)\s?775\b/i, motor: "RS550" },
  { pattern: /\b550\s?(?:and|&|\/)\s?775\b/i, motor: "RS775" },
  { pattern: /\bdual\s775\b/i, motor: "RS775" },
  { pattern: /\bRS[-\s]?775\b/i, motor: "RS775" },
  { pattern: /\bRS[-\s]?550\b/i, motor: "RS550" },
  // A bare "775" or "550" in a motor option ("775 & 550"), never NEO 550's.
  { pattern: /(?<![\w.])775(?!\s?pro)\b/i, motor: "RS775" },
  { pattern: /(?<!NEO\s?)(?<![\w.])550\b/i, motor: "RS550" },
  { pattern: /\bBAG\b/, motor: "BAG" },
  { pattern: /\bmini\s?CIM\b/i, motor: "MiniCIM" },
  { pattern: /(?<!mini\s?)\bCIM\b/i, motor: "CIM" },
  { pattern: /\bFalcon\b|\bFlacon\b/i, motor: "Falcon 500" },
  { pattern: /\bKraken\s?X44\b/i, motor: "Kraken X44" },
  { pattern: /\bKraken(?!\s?X44)\b/i, motor: "Kraken X60" },
  { pattern: /\bMinion\b/i, motor: "Minion" },
  { pattern: /\bNEO\s?Vortex\b|\bVortex\b/i, motor: "NEO Vortex" },
  { pattern: /\bNEO\s?550\b/i, motor: "NEO 550" },
  { pattern: /\bNEO(?!\s?(?:Vortex|550))\b/, motor: "NEO" },
];

/**
 * Bores named after a spline rather than a size, in the label they get. Checked before
 * sizes, so "8mm SplineXS" is SplineXS and "15T 8mm Spline" is the 15T spline.
 */
export const NAMED_BORES: { pattern: RegExp; bore: string }[] = [
  { pattern: /\bspline\s?XS\b/i, bore: "SplineXS" },
  { pattern: /\bspline\s?XL\b/i, bore: "SplineXL" },
  { pattern: /\bMAX\s?Spline\b/i, bore: "MAXSpline" },
  { pattern: /\b(?:Falcon|Flacon)\b/i, bore: "Falcon Spline" },
  { pattern: /\bKraken\b/i, bore: "Kraken Spline" },
  { pattern: /\b(\d+)\s?T(?:ooth)?\s+servo\s+spline\b/i, bore: "$1T Servo Spline" },
  { pattern: /\b(\d+)\s?T(?:ooth)?\s+(?:\d+\s?mm\s+)?spline\b/i, bore: "$1T Spline" },
];

/** Bore texts that aren't a bore to filter by ("Blank" stays as the one plain word). */
export const BORE_WORDS: { pattern: RegExp; bore: string | null }[] = [
  { pattern: /^blank$/i, bore: "Blank" },
  { pattern: /^nub(?:\s+bore)?$/i, bore: "Nub" },
  { pattern: /^universal pulley extension$/i, bore: null },
  { pattern: /^(?:bearing\s+)?bore$|^bearing$/i, bore: null },
  { pattern: /^(?:no\s+shaft|none|n\/a)$/i, bore: null },
];

/** Bore shapes, the longer names first. */
export const BORE_SHAPES: { pattern: RegExp; shape: string }[] = [
  { pattern: /\brounded\s+hex\b|\bround\s+hex\b|\bthunder\s?hex\b/i, shape: "Rounded Hex" },
  { pattern: /\bhex\b/i, shape: "Hex" },
  { pattern: /\bkey(?:ed|way)?\b/i, shape: "Keyed" },
  { pattern: /\bREX\b/i, shape: "REX" },
  { pattern: /\bD(?:[-\s]?(?:bore|shaft|profile))?\b/, shape: "D" },
  { pattern: /\bsquare\b/i, shape: "Square" },
  { pattern: /\bspline\b/i, shape: "Spline" },
  { pattern: /\bround\b/i, shape: "Round" },
];

/**
 * A size with no shape is a round bore, except these, which in FRC are mostly hex: they
 * stay as the size alone rather than a guess (labels as `formatSize` writes them).
 */
export const SHAPELESS_KEEP = new Set(['1/2"', '3/8"']);

/** Materials, in the label they get. */
export const MATERIAL_ALIASES: { pattern: RegExp; material: string }[] = [
  { pattern: /\bstainless\b/i, material: "Stainless" },
  { pattern: /\bsteel\b/i, material: "Steel" },
  { pattern: /\balumin(?:um|ium)\b/i, material: "Aluminum" },
  { pattern: /\bbronze\b/i, material: "Bronze" },
  { pattern: /\bbrass\b/i, material: "Brass" },
  { pattern: /\bpolycarbonate\b/i, material: "Polycarbonate" },
  { pattern: /\b(?:delrin|acetal)\b/i, material: "Delrin" },
  { pattern: /\bnylon\b/i, material: "Nylon" },
  { pattern: /\bplastic\b/i, material: "Plastic" },
];
