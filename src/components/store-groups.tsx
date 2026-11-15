"use client";

import { ChevronDown } from "lucide-react";
import { groupCategories } from "@/domain/category-groups";
import { vendorHref } from "@/domain/vendors";
import { CategoryFlyout } from "./category-flyout";
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
 */
export function StoreGroupCards({ vendor, categories, name }: { vendor: string; categories: Category[]; name: string }) {
  const groups = groupCategories(categories, useSiteFacts().categoryGroups);
  return (
    <nav aria-label={`הקטגוריות של ${name}`}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {groups.map((g) => (
          <li key={g.id} className="group flex">
            <CategoryFlyout
              id={`group-${g.id}`}
              mode="button"
              className="flex w-full"
              href={vendorHref(vendor, { group: g.id })}
              label={g.name}
              allLabel={<>הכל ב{g.name}</>}
              allCount={g.count}
              items={g.items.map((c) => ({
                slug: c.slug,
                name: c.name,
                count: c.count,
                image: c.images[0],
                href: vendorHref(vendor, { group: g.id, category: c.slug }),
              }))}
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
        ))}
      </ul>
    </nav>
  );
}
