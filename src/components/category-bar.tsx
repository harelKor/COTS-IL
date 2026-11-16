"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { groupCategories } from "@/domain/category-groups";
import { droppedText, moveTo, scopeGroup, type Scope } from "@/domain/catalog-nav";
import { catalogHref, type CatalogFilters } from "@/lib/catalog-filters";
import { vendorHref } from "@/domain/vendors";
import { keepInView } from "./anchored-popover";
import { CategoryFlyout, FlyoutList, InlineFlyout, useNarrow, type FlyoutItem } from "./category-flyout";
import { CatalogLink, interceptClick, useCatalogNav } from "./catalog-nav";
import { useSiteFacts } from "./site-facts";
import { showToast } from "./toast";

export type BarCategory = { slug: string; name: string; group: string; count: number; images: string[] };

const tab = "bar-tab flex min-h-14 shrink-0 items-center gap-2 rounded-xl ps-4 text-body font-medium whitespace-nowrap lg:min-h-16";

/**
 * Where a catalog link goes and what it says on the way (CF3): the scope's URL with the filters that
 * still apply (moveTo), and a toast when the spec filters of the scope being left are dropped.
 */
export function useScopeLink(filters: CatalogFilters, categories: { slug: string; name: string; group: string }[], vendor?: string) {
  const { categoryGroups } = useSiteFacts();
  const here = categories.find((c) => c.slug === filters.category)?.name ?? scopeGroup(filters, categories, categoryGroups)?.name ?? null;
  return (to: Partial<Scope>) => {
    const { filters: next, dropped } = moveTo(filters, to);
    const href = vendor ? vendorHref(vendor, next) : catalogHref(next);
    return { href, before: dropped ? () => showToast(droppedText(here)) : undefined };
  };
}

/**
 * The upper category bar of /catalog and a store's results (WCP style): "הכל" and the admin's
 * groups in one strip. A click on a group goes to it (`?group=`); resting on it drops the group's
 * flyout (CategoryFlyout) with its categories, each one click from its parts.
 *
 * It never changes shape (CF3, P1-9): every group and category is always there, with how many
 * products the current list holds in it (the search, vendors, program, stock and price; not the spec
 * filters, which belong to a category). One with nothing in it is greyed, never hidden. Going to
 * another category drops the spec filters, with a toast that says so. On a phone the strip scrolls sideways.
 *
 * On a phone a group's categories open in the page instead of a floating flyout: the first tap on a
 * group opens them (a second goes to the group), as a full-width panel in `inlineSlot`, a place the
 * catalog keeps right after the sticky bar, so they push the list down and scroll with the page.
 */
export function CategoryBar({
  categories,
  filters,
  vendor,
  inlineSlot,
}: {
  /** Every category (of the store, in a store), with its count in the current list. */
  categories: BarCategory[];
  filters: CatalogFilters;
  /** In a vendor's store: the links stay in the store. */
  vendor?: string;
  /** Where a phone's open group shows its categories: outside the sticky bar, so they scroll. */
  inlineSlot?: HTMLElement | null;
}) {
  const { categoryGroups } = useSiteFacts();
  const nav = useCatalogNav();
  const link = useScopeLink(filters, categories, vendor);
  const groups = groupCategories(categories, categoryGroups);
  const open = scopeGroup(filters, categories, categoryGroups)?.id ?? null;
  const all = !filters.category && !open;
  const row = useRef<HTMLUListElement>(null);
  const narrow = useNarrow() && !!inlineSlot;
  // Open for this page only: another group, category or search closes them.
  const page = `${open}|${filters.category}|${filters.q}`;
  const [inline, setInline] = useState<{ id: string; page: string } | null>(null);
  const inlineId = inline?.page === page ? inline.id : null;
  const tapped = useRef<{ el: HTMLElement; top: number } | null>(null);
  useLayoutEffect(() => {
    const t = tapped.current;
    tapped.current = null;
    if (t) keepInView(t, inlineId ? document.getElementById("bar-inline") : null);
  }, [inlineId]);
  // On a phone the chosen group is in view: the bar (not the page) scrolls to it.
  useEffect(() => {
    const el = row.current;
    const on = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !on) return;
    const a = on.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (a.left < b.left + 24 || a.right > b.right - 24) el.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
  }, [open, filters.category]);

  const top = link({});
  const itemsOf = (g: (typeof groups)[number]): FlyoutItem[] =>
    g.items.map((c) => ({
      slug: c.slug,
      name: c.name,
      count: c.count,
      image: c.images[0],
      href: link({ group: g.id, category: c.slug }).href,
      current: c.slug === filters.category,
    }));
  const navigate = (g: (typeof groups)[number]) => (e: React.MouseEvent, href: string) => {
    const item = g.items.find((c) => link({ group: g.id, category: c.slug }).href === href);
    interceptClick(e, nav, href, item ? link({ group: g.id, category: item.slug }).before : link({ group: g.id }).before);
  };
  const inlineGroup = narrow ? groups.find((g) => g.id === inlineId) : undefined;
  return (
    <nav aria-label="קטגוריות" className="category-bar rounded-2xl">
      <ul ref={row} className="no-scrollbar scroll-fade-x flex items-center gap-1 overflow-x-auto px-2 py-1.5 lg:justify-between lg:px-3">
        <li className="bar-item shrink-0">
          <CatalogLink href={top.href} before={top.before} aria-current={all ? "page" : undefined} className={`${tab} pe-4`}>
            הכל
          </CatalogLink>
        </li>
        {groups.map((g) => {
          const whole = link({ group: g.id });
          const empty = g.count === 0;
          return (
            <li key={g.id} className="bar-item shrink-0">
              <CategoryFlyout
                id={`bar-${g.id}`}
                className="flex items-center"
                href={whole.href}
                label={g.name}
                allLabel={<>הכל ב{g.name}</>}
                allCount={g.count}
                items={itemsOf(g)}
                onNavigate={navigate(g)}
                inline={
                  narrow
                    ? {
                        expanded: inlineId === g.id,
                        controls: "bar-inline",
                        onToggle: (el) => {
                          tapped.current = { el, top: el.getBoundingClientRect().top };
                          setInline(inlineId === g.id ? null : { id: g.id, page });
                        },
                      }
                    : undefined
                }
                triggerProps={open === g.id ? { "aria-current": filters.category ? "true" : "page" } : undefined}
                triggerClassName={`${tab} pe-1 ${empty && open !== g.id ? "opacity-55" : ""}`}
                trigger={
                  <>
                    {g.name}
                    <span className="text-caption text-muted tabular-nums">{g.count.toLocaleString("he-IL")}</span>
                  </>
                }
                toggleClassName="-ms-1 flex min-h-14 w-9 shrink-0 lg:min-h-16 items-center justify-center rounded-xl text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
              />
            </li>
          );
        })}
      </ul>
      {inlineGroup &&
        inlineSlot &&
        createPortal(
          <InlineFlyout key={inlineGroup.id} id="bar-inline" label={inlineGroup.name} onClose={() => setInline(null)}>
            <FlyoutList
              href={link({ group: inlineGroup.id }).href}
              allLabel={<>הכל ב{inlineGroup.name}</>}
              allCount={inlineGroup.count}
              items={itemsOf(inlineGroup)}
              onNavigate={navigate(inlineGroup)}
            />
          </InlineFlyout>,
          inlineSlot,
        )}
    </nav>
  );
}
