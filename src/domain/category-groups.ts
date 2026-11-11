/** The catalog's top-level groups of categories, keyed by category slug. */
export const CATEGORY_GROUPS = [
  { id: "electrical", name: "חשמל ובקרה", slugs: ["motors", "electronics", "sensors"] },
  { id: "motion", name: "הנעה ותמסורת", slugs: ["drivetrain", "gearboxes", "gears", "belts-chain", "wheels"] },
  { id: "structure", name: "מבנה וחומרה", slugs: ["bearings", "shafts", "structure", "fasteners"] },
  { id: "mechanisms", name: "מנגנונים ופניאומטיקה", slugs: ["mechanisms", "pneumatics"] },
  { id: "misc", name: "כלים ושונות", slugs: ["tools", "other"] },
] as const;

export type CategoryGroupId = (typeof CATEGORY_GROUPS)[number]["id"];

const FALLBACK: CategoryGroupId = "misc";

const BY_SLUG = new Map<string, CategoryGroupId>(CATEGORY_GROUPS.flatMap((g) => g.slugs.map((s) => [s, g.id] as const)));

/** The group a category belongs to; a new or renamed slug nobody mapped goes to "כלים ושונות". */
export function groupOfCategory(slug: string): CategoryGroupId {
  return BY_SLUG.get(slug) ?? FALLBACK;
}

/** Groups with their categories (in the given order) and a product count; empty groups are dropped. */
export function groupCategories<T extends { slug: string; count?: number }>(categories: T[]) {
  return CATEGORY_GROUPS.map((g) => {
    const items = categories.filter((c) => groupOfCategory(c.slug) === g.id);
    return { id: g.id, name: g.name, items, count: items.reduce((n, c) => n + (c.count ?? 0), 0) };
  }).filter((g) => g.items.length > 0);
}
