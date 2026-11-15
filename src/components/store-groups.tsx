"use client";

import { groupCategories } from "@/domain/category-groups";
import { vendorHref } from "@/domain/vendors";
import { CategoryFlyout } from "./category-flyout";
import { PhotoFan } from "./category-showcase";
import { useSiteFacts } from "./site-facts";

type Category = { slug: string; name: string; group: string; count: number; images: string[] };

/**
 * A store's "כל המוצרים" (S17): the admin's groups as photo cards. A click on a card goes to the
 * whole group in the store (`?group=`); resting on one drops its flyout of categories
 * (CategoryFlyout), each a click from its parts. The resting cards stay as they were: fanned
 * photos, the name and a count in the vendor's tint.
 */
export function StoreGroupCards({ vendor, categories }: { vendor: string; categories: Category[] }) {
  const groups = groupCategories(categories, useSiteFacts().categoryGroups);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {groups.map((g) => (
        <li key={g.id} className="group flex">
          <CategoryFlyout
            id={`group-${g.id}`}
            className="flex w-full"
            width={320}
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
            triggerClassName="glow-box flex w-full flex-col gap-3 p-4 text-start transition-[translate] duration-200 ease-out group-hover:-translate-y-1 sm:p-5"
            trigger={
              <>
                <span className="relative flex h-24 items-center justify-center">
                  <PhotoFan slug={g.items[0]?.slug} images={g.items.flatMap((c) => c.images.slice(0, 1)).slice(0, 3)} />
                </span>
                <span className="flex min-w-0 flex-col items-start gap-1.5 pe-9">
                  <span className="text-body leading-snug font-semibold group-hover:text-brand">{g.name}</span>
                  <span className="count-pill rounded-full px-2.5 py-0.5 text-caption font-semibold tabular-nums">{g.count.toLocaleString("he-IL")} מוצרים</span>
                </span>
              </>
            }
            toggleClassName="absolute end-2 bottom-2 flex size-11 items-center justify-center rounded-full text-brand transition-[translate] duration-200 ease-out group-hover:-translate-y-1 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand sm:end-3 sm:bottom-3"
          />
        </li>
      ))}
    </ul>
  );
}
