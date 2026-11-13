import { CategoryIcon } from "@/components/category-icon";
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
