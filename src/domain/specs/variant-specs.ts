import { materialFromText, pitchFromDescription, specsFromText } from "./extract";
import { normalizeSpec, type NormalSpec, type SpecSource } from "./normalize";
import { DESCRIPTIVE_KEYS, SPEC_KEY_ALIASES } from "./spec-aliases";

export type SourcedSpec = NormalSpec & { source: SpecSource };

type RawSpec = { key: string; value: string; source: SpecSource };
type Product = { title: string; descriptionHtml: string | null; categorySlug: string | null };

/**
 * One variant's filter specs (CF1): its own specs in their one form, then what its option
 * texts, its product's title and (for gears) its description state plainly for the keys
 * still missing: DP or module, teeth, bore (with the motors it names) and material.
 * Each value says where it came from.
 */
export function variantSpecs(raw: RawSpec[], product: Product): SourcedSpec[] {
  const out: SourcedSpec[] = [];
  const seen = new Set<string>();
  const add = (specs: NormalSpec[], source: SpecSource) => {
    for (const s of specs) {
      const id = `${s.key}\u0000${s.value}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ ...s, source });
    }
  };
  const has = (...keys: string[]) => out.some((s) => keys.includes(s.key));

  for (const s of raw) add(normalizeSpec(s.key, s.value, product.title), s.source);

  // "14T (16T C-C) - 1/2in Rounded Hex - 20DP Gear": a descriptive option's DP, teeth and bore.
  for (const s of raw) {
    if (SPEC_KEY_ALIASES[s.key] || !DESCRIPTIVE_KEYS.has(s.key)) continue;
    fill(specsFromText(s.value), s.source);
  }
  fill(specsFromText(product.title), "title");
  if (!has("material")) add(materialFromText(product.title), "title");
  if (product.categorySlug === "gears" && !has("dp", "module")) add(pitchFromDescription(product.descriptionHtml), "description");
  return out;

  /** The pitch, teeth and bore of `found` whose keys the variant doesn't have yet. */
  function fill(found: NormalSpec[], source: SpecSource) {
    const pitch = found.filter((s) => s.key === "dp" || s.key === "module");
    const teeth = found.filter((s) => s.key === "teeth");
    const bore = found.filter((s) => s.key === "bore" || s.key === "motor-fit");
    if (!has("dp", "module")) add(pitch, source);
    if (!has("teeth")) add(teeth, source);
    if (!has("bore") && bore.some((s) => s.key === "bore")) add(bore, source);
  }
}
