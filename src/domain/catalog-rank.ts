/**
 * How the catalog orders a category when nothing was searched: the parts a team came
 * for (motors, controllers, gearboxes) ahead of the screws, spacers and spares that
 * suppliers file next to them.
 */

/** Words in a title that mark a small accessory rather than a main item. Plurals match too. */
const ACCESSORY_WORDS = [
  "bhcs",
  "shcs",
  "fhcs",
  "screw",
  "bolt",
  "nut",
  "washer",
  "spacer",
  "standoff",
  "shim",
  "adapter",
  "cover",
  "hardware",
  "replacement",
  "spare",
  "pack",
];

const alternatives = `(?:${ACCESSORY_WORDS.join("|")})s?`;

/** The same rule for Postgres (`~*`), whose word boundaries are \m and \M, not \b. */
export const ACCESSORY_TITLE_PATTERN = String.raw`\m${alternatives}\M`;

const accessoryRegex = new RegExp(String.raw`\b${alternatives}\b`, "i");

/** Categories whose main items are hardware, so their titles aren't held back. */
export const HARDWARE_CATEGORIES = ["fasteners"];

/** Families from this price (USD) up count as main items, cheaper ones come after them. */
export const MAIN_ITEM_MIN_USD = 25;

export function isAccessoryTitle(title: string): boolean {
  return accessoryRegex.test(title);
}

export type Rankable = {
  title: string;
  categorySlug: string | null;
  available: boolean | null;
  minPriceUsd: number | null;
  variantCount: number;
};

/**
 * The default order's sort key, lowest first: available first, then main items ahead of
 * accessories, then pricier or multi-size families (main items) ahead of cheap single parts.
 * `searchQuery` in src/lib/catalog.ts applies the same steps in SQL.
 */
export function rankKey(f: Rankable): [number, number, number] {
  const accessory = isAccessoryTitle(f.title) && !HARDWARE_CATEGORIES.includes(f.categorySlug ?? "");
  const main = (f.minPriceUsd ?? 0) >= MAIN_ITEM_MIN_USD || f.variantCount >= 3;
  return [f.available === true ? 0 : 1, accessory ? 1 : 0, main ? 0 : 1];
}
