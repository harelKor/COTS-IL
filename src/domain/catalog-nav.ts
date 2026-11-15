import { groupOf, type CategoryGroup } from "./category-groups";
import type { CatalogFilters } from "@/lib/catalog-filters";

/**
 * Moving around the catalog (CF3): the group bar, the breadcrumb, a group's subcategory tiles and a
 * category's sibling pills all go to a scope (a group, a category, or everything) through moveTo, so
 * they keep and drop the same filters.
 */
export type Scope = { group: string; category: string };

/**
 * Whether the spec filters and ranges still mean something at `to`. They belong to a category (the
 * panel shows a category's specs), so they stay only inside it. Without a category they came from a
 * search across the scope, and a narrower scope (one of its categories, or the same group) keeps them.
 */
export function keepsSpecs(from: Scope, to: Scope): boolean {
  if (from.category) return to.category === from.category;
  if (from.group) return to.group === from.group;
  return true;
}

/**
 * The filters at another scope: the search, vendors, program, stock, price, sort and view stay; the
 * spec filters and ranges stay only where keepsSpecs says. `dropped` is true when some were removed,
 * so the page can say so ("הסינונים של גלגלי שיניים הוסרו").
 */
export function moveTo(filters: CatalogFilters, to: Partial<Scope>): { filters: CatalogFilters; dropped: boolean } {
  const scope = { group: to.group ?? "", category: to.category ?? "" };
  const had = Object.keys(filters.specs).length > 0 || Object.keys(filters.ranges).length > 0;
  const keep = keepsSpecs({ group: filters.group, category: filters.category }, scope);
  return {
    filters: { ...filters, ...scope, specs: keep ? filters.specs : {}, ranges: keep ? filters.ranges : {}, page: 1 },
    dropped: had && !keep,
  };
}

/** The toast when moveTo drops filters: named after the scope that is left. */
export function droppedText(scopeName: string | null): string {
  return scopeName ? `הסינונים של ${scopeName} הוסרו` : "סינוני המפרט הוסרו";
}

type NamedCategory = { slug: string; name: string; group: string };

/** The category's group, or the group in the URL when there is no category; null at the top. */
export function scopeGroup<T extends NamedCategory>(scope: Scope, categories: T[], groups: CategoryGroup[]): CategoryGroup | null {
  const current = categories.find((c) => c.slug === scope.category);
  const id = current ? groupOf(current.group, groups) : groups.some((g) => g.id === scope.group) ? scope.group : null;
  return groups.find((g) => g.id === id) ?? null;
}

export type Crumb = { name: string; to: Scope };

/**
 * The breadcrumb "קטלוג › הנעה ותמסורת › גלגלי שיניים": the catalog, the group, the category. The
 * last one is the page itself (its title), the others are links up.
 */
export function crumbTrail<T extends NamedCategory>(scope: Scope, categories: T[], groups: CategoryGroup[]): Crumb[] {
  const trail: Crumb[] = [{ name: "קטלוג", to: { group: "", category: "" } }];
  const group = scopeGroup(scope, categories, groups);
  if (group) trail.push({ name: group.name, to: { group: group.id, category: "" } });
  const current = categories.find((c) => c.slug === scope.category);
  if (current) trail.push({ name: current.name, to: { group: group?.id ?? "", category: current.slug } });
  return trail;
}

/** The categories of the scope's group, in the given order: a group page's tiles and a category's sibling pills. */
export function groupMembers<T extends NamedCategory>(scope: Scope, categories: T[], groups: CategoryGroup[]): T[] {
  const group = scopeGroup(scope, categories, groups);
  return group ? categories.filter((c) => groupOf(c.group, groups) === group.id) : [];
}
