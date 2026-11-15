import { boreFromText, normalizePitchSystem, type NormalSpec } from "./normalize";
import { MATERIAL_ALIASES } from "./spec-aliases";

/**
 * Specs read from free text, for the parts whose options don't give them (CF1 coverage):
 * AndyMark's "Standard 20 DP Gears" says its DP only in the title, REV's "14T (16T C-C) -
 * 1/2in Rounded Hex - 20DP Gear" in one option. Only what the text states plainly.
 */

/**
 * Teeth: "12T", "45t", "28 Tooth". Not a pair ("42t/28t", "15t / 45t"), a range, a
 * spline ("15T Spline", "25 Tooth Spline"), or a center distance ("(16T C-C)").
 */
const TEETH = new RegExp(
  String.raw`(?<!\d[tT]?\s?[-/]\s?)(?<![\d.])\b(\d{1,3})\s?(?:t|tooth|teeth)\b` +
    String.raw`(?!\s?[-/]\s?\d)(?!\s*(?:\d+\s?mm\s+)?(?:servo\s+)?spline\b)(?!\s*(?:C-C|CD|Center)\b)`,
  "gi",
);

export function teethFromText(text: string): NormalSpec[] {
  for (const match of text.replace(/[®™]/g, "").matchAll(TEETH)) {
    const n = Number(match[1]);
    if (n > 0) return [{ key: "teeth", value: `${n}T`, num: n, unit: "T" }];
  }
  return [];
}

/** The material a text names first, only when it names one we know. */
export function materialFromText(text: string): NormalSpec[] {
  let best: { at: number; material: string } | null = null;
  for (const { pattern, material } of MATERIAL_ALIASES) {
    const at = text.search(pattern);
    if (at >= 0 && (!best || at < best.at)) best = { at, material };
  }
  return best ? [{ key: "material", value: best.material, num: null, unit: null }] : [];
}

/** DP or module, teeth and bore (with any motor it names) that a title or option text states. */
export function specsFromText(text: string): NormalSpec[] {
  return [...normalizePitchSystem(text), ...teethFromText(text), ...boreFromText(text)];
}

/**
 * A gear's DP or module from its description, only when the description names exactly
 * one: "compatible with 20 DP and 32 DP gears" says nothing about this part.
 */
export function pitchFromDescription(html: string | null): NormalSpec[] {
  if (!html) return [];
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  const found = new Map<string, NormalSpec>();
  for (const match of text.matchAll(/\b\d+\s?DP\b|\bMOD(?:ULE)?\s?\d+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s?(?:MOD|Module)\b/gi)) {
    for (const s of normalizePitchSystem(match[0])) found.set(`${s.key}:${s.value}`, s);
  }
  return found.size === 1 ? [...found.values()] : [];
}
