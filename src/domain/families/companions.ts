/**
 * "Usually ordered with": parts that go with this one, by simple matching rules
 * until there's order history to learn from. A rule asks for families in a
 * category whose search text contains every one of `terms` and none of `without`.
 */
export type CompanionRule = { category: string; terms: string[]; without?: string[] };

type Input = { categorySlug: string | null; title: string; options: Record<string, string> };

/** '1/2" Hex', '3/8" Rounded Hex' or '8mm SplineXS' as it appears in titles, lowercase. */
function shaftFit(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.match(/(\d+\/\d+"|\d+(?:\.\d+)?mm|\.\d+")\s*(rounded hex|hex|splinexs|splinexl|round)/i);
  return m ? `${m[1]} ${m[2]}`.toLowerCase() : null;
}

function beltPitch(title: string): string | null {
  if (/\bhtd\b/i.test(title)) return "htd";
  if (/\bgt2\b/i.test(title)) return "gt2";
  return null;
}

export function companionRules({ categorySlug, title, options }: Input): CompanionRule[] {
  const rules: CompanionRule[] = [];
  const t = title.toLowerCase();
  const fit = shaftFit(options.bore) ?? shaftFit(options.id);

  if (categorySlug === "belts-chain") {
    const pitch = beltPitch(title);
    const width = options.width?.toLowerCase();
    if (pitch && /\bbelt/.test(t)) rules.push({ category: "belts-chain", terms: ["pulley", pitch, ...(width ? [width] : [])] });
    if (pitch && /\bpulley/.test(t)) rules.push({ category: "belts-chain", terms: ["belt", pitch, ...(width ? [width] : [])], without: ["pulley"] });
    const chain = t.match(/#(25|35)/);
    if (chain && /sprocket/.test(t)) rules.push({ category: "belts-chain", terms: [`#${chain[1]}`, "chain"], without: ["sprocket"] });
  }

  if (fit && (categorySlug === "gears" || categorySlug === "belts-chain" || categorySlug === "wheels")) {
    rules.push({ category: "bearings", terms: [fit] }, { category: "shafts", terms: [fit] });
  }
  if (fit && categorySlug === "bearings") rules.push({ category: "shafts", terms: [fit] });
  if (categorySlug === "shafts") {
    const stock = shaftFit(options.od) ?? shaftFit(title);
    if (stock) rules.push({ category: "bearings", terms: [stock] });
  }

  return rules.slice(0, 3);
}
