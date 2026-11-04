import type { Program, ProductStatus } from "./types";

type Input = { title: string; productType: string | null; tags: string[] };

/**
 * First match wins, so the order matters: a "Kraken spur gear" is a gear, not a
 * motor, and a "hex bore gear" is a gear, not a shaft part.
 */
const CATEGORY_RULES: [slug: string, pattern: RegExp][] = [
  ["other", /merch|swag|t-?shirt|hoodie|sticker|\bhats?\b|gift card|lanyard|rewards?\b/],
  ["tools", /deburr|countersink|\btools?\b|toolbox|3d ?print|\bdrill|wrench|allen key|caliper|filament|\btap\b|machines?\b|bambu|\bspool\b|hotend|nozzle|endmill|\bcnc\b|laser|bit holder|grooving|glue/],
  ["pneumatics", /pneumatic|solenoid|air (tank|compressor)|compressor|\bcylinders?\b/],
  ["gearboxes", /gear ?box|planetary|toughbox|gear ratio/],
  ["belts-chain", /\bbelts?\b|pulley|sprocket|\bchains?\b|\bhtd\b|\bgt2\b|polycord/],
  ["gears", /\bgears?\b|\bdp\b|hexboregears/],
  ["drivetrain", /swerve|drive ?train|drive (base|system)|chassis|\bmk[0-9]/],
  ["mechanisms", /elevator|telescope|shooter|climber|turret|\bintake\b/],
  ["wheels", /\bwheels?\b|traction|\btread|omni|mecanum|\brollers?\b|colson/],
  ["bearings", /bearing|bushing|cam follower/],
  ["sensors", /sensor|encoder|canandcoder|limelight|camera|\bgyro|\bimu\b|pigeon|cancoder/],
  ["motors", /\bmotors?\b|kraken|falcon|\bneo\b|vortex|minion|\bcim\b|servo|talon|spark ?(max|flex)|victor/],
  ["electronics", /electric|\bwires?\b|wiring|\bcables?\b|connector|batter(y|ies)|breaker|fuse|power|radio|voltage|regulator|\bcan\b|\bleds?\b|roborio|systemcore|control system|anderson|candle|candi\b/],
  ["shafts", /shaft|\bhubs?\b|collar|spacer|axle|\bhex\b|dowel/],
  ["fasteners", /screw|\bbolts?\b|\bnuts?\b|nutstrip|washer|rivet|fastener|standoff|\bhardware\b|spring|\bpins?\b|\b[sbpf]hcs\b|#\d+-\d+/],
  ["structure", /extrusion|\btub(e|es|ing)\b|plate|bracket|gusset|structure|framing|\bstock\b|\bsheet|\bchannel/],
];

function searchable({ title, productType, tags }: Input) {
  return [productType ?? "", ...tags, title].join(" ").toLowerCase();
}

export function categorize(input: Input): string {
  const text = searchable(input);
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}

/** Which programs a product is for. Falls back to the supplier's programs when the listing doesn't say. */
export function programsFor(input: Input, supplierPrograms: Program[]): Program[] {
  const text = searchable(input);
  const found: Program[] = [];
  if (/\bfrc\b|robotics competition/.test(text)) found.push("FRC");
  if (/\bftc\b|tech challenge/.test(text)) found.push("FTC");
  const allowed = found.filter((p) => supplierPrograms.includes(p));
  return allowed.length > 0 ? allowed : supplierPrograms;
}

/** Products that stay out of the public catalog. */
export function statusFor(input: Input, hasPrice: boolean): ProductStatus {
  const text = searchable(input);
  if (input.tags.some((t) => t.toLowerCase() === "discontinued")) return "hidden";
  if (/lego league|gift card/.test(text)) return "hidden";
  return hasPrice ? "published" : "review";
}
