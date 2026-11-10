/**
 * "מתאים לשימוש עם": parts that go with this one, by simple matching rules
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

/** The motor a title names, as it appears in other parts' titles ("kraken x60"). */
function motorName(title: string): string | null {
  const m = title.match(/\b(kraken x60|kraken x44|neo vortex|neo 550|neo 2\.0|neo|falcon 500|minion|pulsar 775|cim|775pro)\b/i);
  return m ? m[1].toLowerCase() : null;
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

  // Motors: mounts, spacers and adapters for that motor, then the wires and connectors it needs.
  const motor = motorName(title);
  if (categorySlug === "motors" && motor) {
    rules.push({ category: "motors", terms: [motor], without: ["brushless motor", "t-shirt", "wrist band"] });
    rules.push({ category: "gearboxes", terms: [motor] });
    rules.push({ category: "electronics", terms: [motor] });
  }
  if (categorySlug === "motors" && !motor) rules.push({ category: "electronics", terms: ["motor controller"] });

  // Swerve modules: their wheels and gears.
  if (/\bswerve\b/.test(t) && (categorySlug === "drivetrain" || categorySlug === "gearboxes") && !/\b(wheel|tread|gear)\b/.test(t)) {
    rules.push({ category: "drivetrain", terms: ["swerve", "wheel"] }, { category: "gears", terms: ["swerve"] }, { category: "motors", terms: ["kraken x60"] });
  }

  // Electronics with power or CAN: wire and connectors.
  if (categorySlug === "electronics" && /controller|talon|spark|nova|pdh|pdp|power distribution|canivore|candle|cancoder|pigeon/.test(t)) {
    rules.push({ category: "electronics", terms: ["wire"] }, { category: "electronics", terms: ["connector"] });
  }

  return rules.slice(0, 3);
}
