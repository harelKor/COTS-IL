"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { groupCategories } from "@/domain/category-groups";
import { vendorHref } from "@/domain/vendors";
import { keepInView } from "./anchored-popover";
import { CategoryFlyout, FlyoutList, InlineFlyout, useNarrow, type FlyoutItem } from "./category-flyout";
import { PhotoFan } from "./category-showcase";
import { useSiteFacts } from "./site-facts";
import { countOf, PRODUCT } from "@/domain/plural";

type Category = { slug: string; name: string; group: string; count: number; images: string[] };

/**
 * A store's groups, right under its banner (S17): the admin's groups as large photo cards in the
 * vendor's tint. A card is a disclosure: a click or a tap opens its flyout of categories
 * (CategoryFlyout, mode "button") and keeps it open until a click elsewhere, Escape or the card
 * again; with a mouse, resting on it previews the flyout. The flyout's first row is the whole group,
 * the others each a click from their parts.
 *
 * On a phone (two cards a row) the categories open in the page instead, as a full-width panel under
 * the tapped card's row that pushes the rest down and scrolls with the page. Tapping another card
 * moves the panel to that card's row, and the page keeps the tapped card where the finger is.
 */
export function StoreGroupCards({ vendor, categories, name }: { vendor: string; categories: Category[]; name: string }) {
  const groups = groupCategories(categories, useSiteFacts().categoryGroups);
  const narrow = useNarrow();
  const [openId, setOpenId] = useState<string | null>(null);
  /** The tapped card and where it was on screen: after the panel moves, the page is scrolled back by the difference. */
  const tapped = useRef<{ el: HTMLElement; top: number } | null>(null);

  useLayoutEffect(() => {
    const t = tapped.current;
    tapped.current = null;
    if (t) keepInView(t, openId ? document.getElementById(`group-${openId}-inline`) : null);
  }, [openId]);

  const itemsOf = (g: (typeof groups)[number]): FlyoutItem[] =>
    g.items.map((c) => ({ slug: c.slug, name: c.name, count: c.count, image: c.images[0], href: vendorHref(vendor, { group: g.id, category: c.slug }) }));
  const openIndex = narrow && openId ? groups.findIndex((g) => g.id === openId) : -1;
  // The panel goes after the last card of the open card's row (two a row on a phone).
  const panelAfter = openIndex < 0 ? -1 : Math.min(openIndex - (openIndex % 2) + 1, groups.length - 1);

  return (
    <nav aria-label={`הקטגוריות של ${name}`}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {groups.map((g, i) => {
          const href = vendorHref(vendor, { group: g.id });
          const inlineId = `group-${g.id}-inline`;
          const open = groups[openIndex];
          return (
            <Fragment key={g.id}>
              <li className="group flex">
                <CategoryFlyout
                  id={`group-${g.id}`}
                  mode="button"
                  className="flex w-full"
                  href={href}
                  label={g.name}
                  allLabel={<>הכל ב{g.name}</>}
                  allCount={g.count}
                  items={itemsOf(g)}
                  inline={
                    narrow
                      ? {
                          expanded: openId === g.id,
                          controls: inlineId,
                          onToggle: (el) => {
                            tapped.current = { el, top: el.getBoundingClientRect().top };
                            setOpenId((id) => (id === g.id ? null : g.id));
                          },
                        }
                      : undefined
                  }
                  triggerClassName="glow-box flex w-full flex-col gap-4 p-4 text-start transition-[translate] duration-200 ease-out group-hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-5"
                  trigger={
                    <>
                      <span className="relative flex h-28 items-center justify-center sm:h-36">
                        <PhotoFan slug={g.items[0]?.slug} images={g.items.flatMap((c) => c.images.slice(0, 1)).slice(0, 3)} large />
                      </span>
                      <span className="flex items-end justify-between gap-2">
                        <span className="flex min-w-0 flex-col items-start gap-2">
                          <span className="text-body leading-snug font-semibold group-hover:text-brand sm:text-section">{g.name}</span>
                          <span className="count-pill rounded-full px-2.5 py-0.5 text-caption font-semibold tabular-nums">{countOf(g.count, PRODUCT)}</span>
                        </span>
                        <ChevronDown
                          size={20}
                          strokeWidth={1.75}
                          aria-hidden
                          className="shrink-0 text-brand transition-transform duration-200 group-has-[[aria-expanded=true]]:rotate-180 motion-reduce:transition-none"
                        />
                      </span>
                    </>
                  }
                />
              </li>
              {i === panelAfter && open && (
                <li key={`${open.id}-inline`} className="col-span-2 sm:hidden">
                  <InlineFlyout id={`group-${open.id}-inline`} label={open.name} onClose={() => setOpenId(null)}>
                    <FlyoutList href={vendorHref(vendor, { group: open.id })} allLabel={<>הכל ב{open.name}</>} allCount={open.count} items={itemsOf(open)} />
                  </InlineFlyout>
                </li>
              )}
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}
