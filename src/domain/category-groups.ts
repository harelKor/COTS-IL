/**
 * The catalog's top-level groups of categories (S16d). The admin names and orders the
 * groups in /admin/settings/categories (`content.categoryGroups` in site_settings) and
 * picks each category's group (`categories.group_id`). These defaults are the map that
 * lived here before; the `categories_admin` migration copied the slugs into the table.
 */
export type CategoryGroup = { id: string; name: string };

export const DEFAULT_CATEGORY_GROUPS: (CategoryGroup & { slugs: string[] })[] = [
  { id: "electrical", name: "חשמל ובקרה", slugs: ["motors", "electronics", "sensors"] },
  { id: "motion", name: "הנעה ותמסורת", slugs: ["drivetrain", "gearboxes", "gears", "belts-chain", "wheels"] },
  { id: "structure", name: "מבנה וחומרה", slugs: ["bearings", "shafts", "structure", "fasteners"] },
  { id: "mechanisms", name: "מנגנונים ופניאומטיקה", slugs: ["mechanisms", "pneumatics"] },
  { id: "misc", name: "כלים ושונות", slugs: ["tools", "other"] },
];

/** The group a category is in; one that points at a removed group goes to the last group. */
export function groupOf(groupId: string | null | undefined, groups: CategoryGroup[]): string | null {
  if (groups.length === 0) return null;
  return groups.some((g) => g.id === groupId) ? groupId! : groups[groups.length - 1].id;
}

/** Groups in the admin's order with their categories (in the given order) and a product count; empty groups are dropped. */
export function groupCategories<T extends { slug: string; group: string; count?: number }>(categories: T[], groups: CategoryGroup[]) {
  return groups
    .map((g) => {
      const items = categories.filter((c) => groupOf(c.group, groups) === g.id);
      return { id: g.id, name: g.name, items, count: items.reduce((n, c) => n + (c.count ?? 0), 0) };
    })
    .filter((g) => g.items.length > 0);
}

/** The list with `id` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveId(ids: string[], id: string, by: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** A group id from its name for a new group: latin letters and digits, unique among `taken`. */
export function newGroupId(taken: string[]): string {
  let n = taken.length + 1;
  while (taken.includes(`g${n}`)) n++;
  return `g${n}`;
}

/**
 * The home page's group cards on a desktop, by position in the admin's order: how many of a
 * 6-column row each card spans. The first two are wide (half a row each), the next ones a third
 * each; a row that can't fill with thirds closes with halves (two or four left) or one full-width
 * card (one left), so no row ends with a gap whatever the number of groups.
 */
export function groupSpans(n: number): (2 | 3 | 6)[] {
  if (n <= 0) return [];
  if (n === 1) return [6];
  const spans: (2 | 3 | 6)[] = [3, 3];
  let left = n - 2;
  while (left > 0) {
    if (left === 1) {
      spans.push(6);
      left = 0;
    } else if (left === 2 || left === 4) {
      spans.push(3, 3);
      left -= 2;
    } else {
      spans.push(2, 2, 2);
      left -= 3;
    }
  }
  return spans;
}
