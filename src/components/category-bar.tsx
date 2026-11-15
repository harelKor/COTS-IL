"use client";

import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { groupCategories, groupOf } from "@/domain/category-groups";
import { catalogHref, type CatalogFilters } from "@/lib/catalog-filters";
import { vendorHref } from "@/domain/vendors";
import { CategoryFlyout } from "./category-flyout";
import { useSiteFacts } from "./site-facts";

export type BarCategory = { slug: string; name: string; group: string; count: number; images: string[] };

const tab = "bar-tab flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl ps-3 text-callout font-medium whitespace-nowrap";

/**
 * The upper category bar of /catalog and a store's results (WCP style): "הכל" and the admin's
 * groups in one strip. A click on a group filters the list to it (`?group=`); resting on it drops
 * the group's flyout (CategoryFlyout) with its categories, each one click from its parts. Under the
 * bar, a chosen category shows as one chip, "group › category", whose × steps back to the group.
 * The counts are the current list's (the search and filters); a category with nothing in it is
 * left out unless it's the chosen one, so it can be seen and left. On a phone the strip scrolls sideways.
 */
export function CategoryBar({
  categories,
  category,
  group = "",
  q,
  vendor,
}: {
  categories: BarCategory[];
  /** The chosen category's slug, or "". */
  category: string;
  /** The chosen group's id, or "". */
  group?: string;
  q: string;
  /** In a vendor's store: the links stay in the store. */
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
  const all = !category && !open;
  const row = useRef<HTMLUListElement>(null);
  // On a phone the chosen group is in view: the bar (not the page) scrolls to it.
  useEffect(() => {
    const el = row.current;
    const on = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !on) return;
    const a = on.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (a.left < b.left + 24 || a.right > b.right - 24) el.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
  }, [open, category]);

  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="קטגוריות" className="category-bar rounded-2xl">
        <ul ref={row} className="no-scrollbar scroll-fade-x flex items-center gap-0.5 overflow-x-auto px-1.5 py-1 lg:justify-between">
          <li className="bar-item shrink-0">
            <Link href={href({ q })} aria-current={all ? "page" : undefined} className={`${tab} pe-3`}>
              הכל
            </Link>
          </li>
          {groups.map((g) => (
            <li key={g.id} className="bar-item shrink-0">
              <CategoryFlyout
                id={`bar-${g.id}`}
                className="flex items-center"
                href={href({ q, group: g.id })}
                label={g.name}
                allLabel={<>הכל ב{g.name}</>}
                allCount={g.count}
                items={g.items.map((c) => ({
                  slug: c.slug,
                  name: c.name,
                  count: c.count,
                  image: c.images[0],
                  href: href({ q, group: g.id, category: c.slug }),
                  current: c.slug === category,
                }))}
                triggerProps={open === g.id ? { "aria-current": category ? "true" : "page" } : undefined}
                triggerClassName={`${tab} pe-1`}
                trigger={
                  <>
                    {g.name}
                    {/* The count from 1280px, so the bar fits one line at 1024px; the flyout always has it. */}
                    <span className="hidden text-caption text-muted tabular-nums xl:inline">{g.count.toLocaleString("he-IL")}</span>
                  </>
                }
                toggleClassName="-ms-1 flex min-h-11 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
              />
            </li>
          ))}
        </ul>
      </nav>
      {openGroup && current && (
        <div className="flex flex-wrap items-center gap-2 text-caption">
          <span className="bar-chip flex min-h-11 items-center gap-1 rounded-full ps-1 pe-1">
            <Link href={href({ q, group: openGroup.id })} className="flex min-h-11 items-center rounded-full px-3 text-muted hover:text-foreground">
              {openGroup.name}
            </Link>
            <ChevronLeft size={14} aria-hidden className="text-muted" />
            <span aria-current="page" className="px-2 font-semibold">
              {current.name}
            </span>
            <Link
              href={href({ q, group: openGroup.id })}
              aria-label={`הסרת ${current.name}, חזרה ל${openGroup.name}`}
              className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground"
            >
              <X size={16} strokeWidth={2} aria-hidden />
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
