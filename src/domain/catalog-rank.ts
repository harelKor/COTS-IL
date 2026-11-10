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

export type PhotoCandidate = Rankable & { images: string[] };

/**
 * The home page's photos for each category: the first photo of its top `perCategory`
 * families in the default order (then pricier first, then by title). Worked out once per
 * regroup and stored on `categories.images`, because ranking every family on each
 * render cost 1.7 s of database time (Nov 10, 2026).
 */
export function categoryPhotos(families: PhotoCandidate[], perCategory = 3): Map<string, string[]> {
  const bySlug = new Map<string, PhotoCandidate[]>();
  for (const f of families) {
    if (!f.categorySlug || f.images.length === 0) continue;
    bySlug.set(f.categorySlug, [...(bySlug.get(f.categorySlug) ?? []), f]);
  }
  const out = new Map<string, string[]>();
  for (const [slug, list] of bySlug) {
    const sorted = list
      .map((f) => ({ f, key: rankKey(f) }))
      .sort(
        (a, b) =>
          a.key[0] - b.key[0] ||
          a.key[1] - b.key[1] ||
          a.key[2] - b.key[2] ||
          (b.f.minPriceUsd ?? -Infinity) - (a.f.minPriceUsd ?? -Infinity) ||
          a.f.title.localeCompare(b.f.title),
      );
    out.set(slug, sorted.slice(0, perCategory).map(({ f }) => f.images[0]));
  }
  return out;
}
