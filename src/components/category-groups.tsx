"use client";

import Link from "next/link";
import { groupCategories, groupOf } from "@/domain/category-groups";
import { catalogHref, type CatalogFilters } from "@/lib/catalog-filters";
import { vendorHref } from "@/domain/vendors";
import { useSiteFacts } from "./site-facts";

const chip = (on: boolean) =>
  `flex min-h-11 items-center justify-center gap-1.5 text-center leading-tight sm:justify-start sm:text-start rounded-full px-2.5 text-caption transition-colors sm:gap-2 sm:px-4 sm:text-callout ${
    on ? "bg-brand text-white" : "bg-subtle text-foreground hover:bg-line/60"
  }`;

/**
 * "הכל" and the admin's groups. Pressing a group filters the list to every category in it (`?group=`)
 * and opens a second row with its categories; pressing one of those narrows it further. Pressing the
 * open group again, or "הכל", clears it. The counts are the current list's (the search and filters),
 * and a category with nothing in it is left out, unless it's the chosen one, so it can be seen and left.
 */
export function CategoryGroups({
  categories,
  category,
  group = "",
  q,
  vendor,
}: {
  categories: { slug: string; name: string; group: string; count: number }[];
  /** The chosen category's slug, or "". */
  category: string;
  /** The chosen group's id, or "". */
  group?: string;
  q: string;
  /** In a vendor's store: the chips stay in the store. */
  vendor?: string;
}) {
  const href = (f: Partial<CatalogFilters>) => (vendor ? vendorHref(vendor, f) : catalogHref(f));
  const { categoryGroups } = useSiteFacts();
  const groups = groupCategories(
    categories.filter((c) => c.count > 0 || c.slug === category),
    categoryGroups,
  );
  // The URL's group, or the chosen category's own group (an old link with only a category).
  const current = categories.find((c) => c.slug === category);
  const open = (groups.some((g) => g.id === group) ? group : "") || (current ? groupOf(current.group, categoryGroups) : null);
  const openGroup = groups.find((g) => g.id === open);

  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="קבוצות קטגוריות" className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        <Link href={href({ q })} className={chip(!category && !open)} aria-current={!category && !open ? "page" : undefined}>
          הכל
        </Link>
        {groups.map((g) => {
          // Pressing the group that is the whole filter clears it.
          const only = open === g.id && !category;
          return (
            <Link
              key={g.id}
              href={href(only ? { q } : { q, group: g.id })}
              aria-current={open === g.id ? "true" : undefined}
              aria-controls="category-group-row"
              className={chip(open === g.id)}
            >
              {g.name}
              <span className="hidden text-caption opacity-75 sm:inline">{g.count}</span>
            </Link>
          );
        })}
      </nav>
      <div id="category-group-row" role="navigation" aria-label="קטגוריות" hidden={!openGroup} className="flex flex-wrap gap-1.5 sm:gap-2">
        {openGroup?.items.map((c) => (
          <Link key={c.slug} href={href({ q, group: openGroup.id, category: c.slug })} className={chip(category === c.slug)} aria-current={category === c.slug ? "page" : undefined}>
            {c.name}
            <span className="text-caption opacity-75">{c.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
