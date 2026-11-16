"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { groupCategories, groupSpans } from "@/domain/category-groups";
import { catalogHref } from "@/lib/catalog-filters";
import { keepInView } from "./anchored-popover";
import { CategoryFlyout, FlyoutList, InlineFlyout, useNarrow, type FlyoutItem } from "./category-flyout";
import { PhotoFan } from "./category-showcase";
import { useSiteFacts } from "./site-facts";
import { countOf, PRODUCT } from "@/domain/plural";

export type GroupTile = { slug: string; name: string; group: string; count: number; images: string[]; href: string };

/** A card's width on a desktop, out of the grid's six columns (groupSpans). */
const SPAN = { 2: "lg:col-span-2", 3: "lg:col-span-3", 6: "lg:col-span-6" } as const;

/**
 * The home page's groups (the admin's, in the admin's order), as big photo cards beside the FTC
 * photo: on a desktop the first two wide, half a row each, the rest a third each (groupSpans);
 * three a row on a tablet, two on a phone. The same way in as the stores' group cards
 * (store-groups.tsx): a card is a disclosure that opens the shared flyout of categories
 * (CategoryFlyout), kept to the cards' side of the page so it never covers the photo; "הכל ב…" is
 * the group, every other row a category, one click from its parts. On a phone the categories open
 * in the page, under the tapped card's row, and the page keeps that card under the finger.
 */
export function GroupBoxes({ categories }: { categories: GroupTile[] }) {
  const groups = groupCategories(categories, useSiteFacts().categoryGroups);
  const spans = groupSpans(groups.length);
  const narrow = useNarrow();
  const [openId, setOpenId] = useState<string | null>(null);
  const tapped = useRef<{ el: HTMLElement; top: number } | null>(null);

  useLayoutEffect(() => {
    const t = tapped.current;
    tapped.current = null;
    if (t) keepInView(t, openId ? document.getElementById(`home-group-${openId}-inline`) : null);
  }, [openId]);

  const itemsOf = (g: (typeof groups)[number]): FlyoutItem[] =>
    g.items.map((c) => ({ slug: c.slug, name: c.name, count: c.count, image: c.images[0], href: c.href }));
  const openIndex = narrow && openId ? groups.findIndex((g) => g.id === openId) : -1;
  // Two a row on a phone; an odd last card takes the whole row. The panel goes after the open card's row.
  const lastAlone = groups.length % 2 === 1;
  const panelAfter = openIndex < 0 ? -1 : Math.min(openIndex - (openIndex % 2) + 1, groups.length - 1);
  const open = groups[openIndex];

  return (
    <nav aria-label="קטגוריות לפי סוג מוצר">
      <ul className="home-groups grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6 lg:gap-5">
        {groups.map((g, i) => {
          const wide = spans[i] >= 3;
          const alone = lastAlone && i === groups.length - 1;
          return (
            <Fragment key={g.id}>
              <li className={`home-group group flex ${SPAN[spans[i]]} ${alone ? "max-sm:col-span-2" : ""}`} style={{ "--i": i } as CSSProperties}>
                <CategoryFlyout
                  id={`home-group-${g.id}`}
                  mode="button"
                  within=".home-groups"
                  className="flex w-full"
                  href={catalogHref({ group: g.id })}
                  label={g.name}
                  allLabel={<>הכל ב{g.name}</>}
                  allCount={g.count}
                  items={itemsOf(g)}
                  inline={
                    narrow
                      ? {
                          expanded: openId === g.id,
                          controls: `home-group-${g.id}-inline`,
                          onToggle: (el) => {
                            tapped.current = { el, top: el.getBoundingClientRect().top };
                            setOpenId((id) => (id === g.id ? null : g.id));
                          },
                        }
                      : undefined
                  }
                  triggerClassName="home-group-card glow-box flex w-full flex-col gap-4 p-4 text-start transition-[translate] duration-200 ease-out group-hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-5 lg:p-6"
                  trigger={
                    <>
                      <span className={`fan-xl relative flex h-28 items-center justify-center sm:h-40 lg:h-48 ${wide ? "lg:h-52" : ""}`}>
                        <PhotoFan slug={g.items[0]?.slug} images={g.items.flatMap((c) => c.images.slice(0, 1)).slice(0, 3)} xl />
                      </span>
                      <span className="flex items-end justify-between gap-2">
                        <span className="flex min-w-0 flex-col items-start gap-2">
                          <span className="text-body leading-snug font-semibold group-hover:text-brand sm:text-section lg:text-[22px]">{g.name}</span>
                          <span className="count-pill rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap tabular-nums">{countOf(g.count, PRODUCT)}</span>
                        </span>
                        <ChevronDown
                          size={20}
                          strokeWidth={1.75}
                          aria-hidden
                          className="shrink-0 text-brand transition-transform duration-200 group-has-[[aria-expanded=true]]:rotate-180 motion-reduce:transition-none max-[399px]:hidden"
                        />
                      </span>
                    </>
                  }
                />
              </li>
              {i === panelAfter && open && (
                <li key={`${open.id}-inline`} className="col-span-2 sm:hidden">
                  <InlineFlyout id={`home-group-${open.id}-inline`} label={open.name} onClose={() => setOpenId(null)}>
                    <FlyoutList href={catalogHref({ group: open.id })} allLabel={<>הכל ב{open.name}</>} allCount={open.count} items={itemsOf(open)} />
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
