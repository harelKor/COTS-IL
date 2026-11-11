"use client";

import Link from "next/link";
import { useState } from "react";
import { groupCategories, groupOfCategory } from "@/domain/category-groups";
import { catalogHref } from "@/lib/catalog-filters";

const chip = (on: boolean) =>
  `flex min-h-11 items-center justify-center gap-1.5 text-center leading-tight sm:justify-start sm:text-start rounded-full px-2.5 text-caption transition-colors sm:gap-2 sm:px-4 sm:text-callout ${
    on ? "bg-brand text-white" : "bg-subtle text-foreground hover:bg-line/60"
  }`;

/**
 * "הכל" and five groups; pressing a group opens a second row with only its categories. The
 * chosen category's group starts open. A group alone doesn't filter.
 */
export function CategoryGroups({ categories, category, q }: { categories: { slug: string; name: string; count: number }[]; category: string; q: string }) {
  const groups = groupCategories(categories);
  const activeGroup = category ? groupOfCategory(category) : null;
  // The user's own choice wins until the URL's category changes.
  const [picked, setPicked] = useState<{ category: string; open: string | null } | null>(null);
  const open = picked && picked.category === category ? picked.open : activeGroup;
  const openGroup = groups.find((g) => g.id === open);

  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="קבוצות קטגוריות" className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        <Link href={catalogHref({ q })} className={chip(!category && !open)} aria-current={!category ? "page" : undefined}>
          הכל
        </Link>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-expanded={open === g.id}
            aria-controls="category-group-row"
            onClick={() => setPicked({ category, open: open === g.id ? null : g.id })}
            className={chip(activeGroup === g.id || open === g.id)}
          >
            {g.name}
            <span className="hidden text-caption opacity-75 sm:inline">{g.count}</span>
          </button>
        ))}
      </nav>
      <div id="category-group-row" role="navigation" aria-label="קטגוריות" hidden={!openGroup} className="flex flex-wrap gap-1.5 sm:gap-2">
        {openGroup?.items.map((c) => (
          <Link key={c.slug} href={catalogHref({ q, category: c.slug })} className={chip(category === c.slug)} aria-current={category === c.slug ? "page" : undefined}>
            {c.name}
            <span className="text-caption opacity-75">{c.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
