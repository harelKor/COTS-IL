import "server-only";
import { groupCategories } from "@/domain/category-groups";
import { homeVendorOrder } from "@/domain/vendors";
import { getFacets } from "./catalog";
import { getSettings } from "./settings";

export type HeaderNav = Awaited<ReturnType<typeof getHeaderNav>>;

/**
 * The header's "קטגוריות" and "ספקים" menus (T18): the admin's category groups with their shown
 * categories (hidden and empty ones are already left out of the facets), and the active vendors in
 * home-page order. Both reads are cached, so every page's header costs no database call.
 */
export async function getHeaderNav() {
  const [{ categories, suppliers }, { content }] = await Promise.all([getFacets(), getSettings()]);
  const groups = groupCategories(
    categories.map((c) => ({ slug: c.slug, name: c.name, group: c.group ?? "" })),
    content.categoryGroups,
  ).map((g) => ({ id: g.id, name: g.name, items: g.items.map(({ slug, name }) => ({ slug, name })) }));
  const vendors = homeVendorOrder(suppliers).map((s) => ({ code: s.code, name: s.name, logoUrl: s.logoUrl, count: s.count }));
  return { groups, vendors };
}
