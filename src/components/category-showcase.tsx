import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { groupCategories } from "@/domain/category-groups";
import { shopifyImage } from "@/lib/images";

/** Where each of up to three photos sits in the fan: the first in front, the others tilted behind it. */
const FAN = [
  "z-20 size-[72px] sm:size-[84px]",
  "z-10 size-14 -translate-x-[34px] translate-y-2 -rotate-[8deg] sm:size-[68px] sm:-translate-x-[54px]",
  "z-10 size-14 translate-x-[34px] translate-y-2 rotate-[8deg] sm:size-[68px] sm:translate-x-[54px]",
];

/** Up to three real product photos fanned out on studio tiles; the category's icon only when it has none. */
export function PhotoFan({ slug, images }: { slug?: string; images: string[] }) {
  if (images.length === 0) {
    return (
      <span className="tile-fade flex size-[84px] items-center justify-center rounded-2xl">
        <CategoryIcon slug={slug ?? "other"} />
      </span>
    );
  }
  return (
    <>
      {images.slice(0, 3).map((src, i) => (
        <span
          key={src}
          className={`tile-fade absolute flex items-center justify-center overflow-hidden rounded-2xl p-2 shadow-card transition duration-300 ease-out ${FAN[i]} ${
            i === 0 ? "group-hover:-translate-y-1 group-hover:scale-[1.04]" : ""
          }`}
        >
          {/* Hot-linked from the supplier's CDN, like every catalog photo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...shopifyImage(src, 100)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full object-contain mix-blend-multiply"
          />
        </span>
      ))}
    </>
  );
}

type Tile = { slug: string; name: string; count: number; images: string[]; href: string };

/** Categories under their five group headings, one photo tile each. */
export function CategoryTiles({ categories, headingLevel = 3 }: { categories: Tile[]; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col gap-6">
      {groupCategories(categories).map((g) => (
        <section key={g.id} aria-label={g.name}>
          <Heading className="mb-3 text-body font-semibold text-muted">{g.name}</Heading>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {g.items.map((c) => (
              <li key={c.slug}>
                <Link
                  href={c.href}
                  className="group flex h-full flex-col gap-4 rounded-[22px] border border-line bg-tile-card p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-1 hover:border-brand/50 hover:shadow-lift sm:p-5"
                >
                  <span className="relative flex h-24 items-center justify-center">
                    <PhotoFan slug={c.slug} images={c.images} />
                  </span>
                  <span className="flex flex-col items-start gap-1.5">
                    <span className="text-body leading-snug font-semibold text-foreground transition-colors group-hover:text-brand">{c.name}</span>
                    <span className="rounded-full bg-brand-soft/70 px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
                      {c.count.toLocaleString("he-IL")} מוצרים
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
