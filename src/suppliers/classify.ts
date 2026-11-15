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
  ["gears", /\bgears?\b|\bdp\b|hexboregears|\bworms?\b/],
  ["drivetrain", /swerve|drive ?train|drive (base|system)|chassis|\bmk[0-9]/],
  ["mechanisms", /elevator|telescope|shooter|climber|turret|\bintake\b|viper-slide|linear slide|\bshocks?\b|control-arm/],
  ["wheels", /\bwheels?\b|traction|\btread|omni|mecanum|\brollers?\b|colson|grid-track|grouser|tensioner kit/],
  ["bearings", /bearing|bushing|cam follower|pillow block/],
  ["sensors", /sensor|encoder|canandcoder|limelight|camera|\bgyro|\bimu\b|pigeon|cancoder|odometry|limit switch/],
  ["motors", /\bmotors?\b|kraken|falcon|\bneo\b|vortex|minion|\bcim\b|servo|talon|spark ?(max|flex|mini)|victor|yellow jacket|stingray/],
  ["electronics", /electric|\bwires?\b|wiring|\bcables?\b|connector|batter(y|ies)|breaker|fuse|power|radio|voltage|regulator|\bcan\b|\bleds?\b|roborio|systemcore|control system|anderson|candle|candi\b|xt30|xt60|display|control hub|expansion hub|pwm switch|receiver|transmitter|indicator light|enclosure/],
  ["shafts", /shaft|\bhubs?\b|maxhubs?|collar|spacer|axle|\bhex\b|dowel|spline|coupler|cv joint|universal joint/],
  ["fasteners", /screw|\bbolts?\b|\bnuts?\b|nutstrip|washer|rivet|fastener|standoff|\bhardware\b|spring|\bpins?\b|\b[sbpf]hcs\b|#\d+-\d+|threaded rod/],
  ["structure", /extrusion|\btub(e|es|ing)\b|maxtube|plate|bracket|gusset|structure|framing|\bstock\b|\bsheet|channel|\bangle\b|\bbeams?\b|hinge|linear motion|gorail|gotube|pattern adaptor/],
];

function searchable({ title, productType, tags }: Input) {
  return [productType ?? "", ...tags, title].join(" ").toLowerCase();
}

export function categorize(input: Input): string {
  const text = searchable(input);
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}

/**
 * For stores whose tags are breadcrumbs (BigCommerce: "Hardware & Tools › Fasteners"):
 * the title and the deepest breadcrumb first, so a screw filed under "Hardware & Tools"
 * isn't a tool; the whole trail only when they say nothing.
 */
export function categorizeByTitleFirst(input: Input): string {
  const own = categorize({ ...input, tags: [] });
  return own !== "other" ? own : categorize(input);
}

/** Categories that say where a part goes (an intake, a shooter), not what it is (a wheel, a tube). */
const USE_CATEGORIES = new Set(["mechanisms"]);
/**
 * Categories a title names reliably. Not "shafts" or "fasteners": any "1/2\" Hex" or "bolt
 * pattern" matches those, so a friction brake would become a shaft.
 */
const KIND_CATEGORIES = new Set(["wheels", "structure", "belts-chain", "gears", "gearboxes", "bearings", "motors", "sensors", "pneumatics"]);

/**
 * For Shopify stores, whose product types and tags often say where a part is used
 * ("Compliant & Intake", "intake"): when they put it under mechanisms and the title names
 * what it is ("Stealth and Sushi Wheels"), the title wins. Otherwise the vendor's own type
 * and tags still lead: they file a wire stripper under tools, where a title-first rule
 * would read "wire" and call it electronics.
 */
export function categorizeShopify(input: Input): string {
  const tagged = categorize(input);
  if (!USE_CATEGORIES.has(tagged)) return tagged;
  const own = categorize({ title: input.title, productType: null, tags: [] });
  return KIND_CATEGORIES.has(own) ? own : tagged;
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
  // AndyMark lists its Australian stock again as "Ships from Sydney - …", with its own SKUs (am-0995AUS).
  if (/^ships from sydney -/i.test(input.title)) return "hidden";
  return hasPrice ? "published" : "review";
}
