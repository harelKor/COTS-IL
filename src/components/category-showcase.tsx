import { CategoryIcon } from "@/components/category-icon";
import { shopifyImage } from "@/lib/images";

/** Where each of up to three photos sits in the fan: the first in front, the others tilted behind it. */
const FAN = [
  "z-20 size-[72px] sm:size-[84px]",
  "z-10 size-14 -translate-x-[34px] translate-y-2 -rotate-[8deg] sm:size-[68px] sm:-translate-x-[54px]",
  "z-10 size-14 translate-x-[34px] translate-y-2 rotate-[8deg] sm:size-[68px] sm:translate-x-[54px]",
];
/** The same fan, larger: a store's group cards. */
const FAN_LARGE = [
  "z-20 size-[84px] sm:size-[108px]",
  "z-10 size-16 -translate-x-[30px] translate-y-2 -rotate-[8deg] sm:size-[84px] sm:-translate-x-[46px]",
  "z-10 size-16 translate-x-[30px] translate-y-2 rotate-[8deg] sm:size-[84px] sm:translate-x-[46px]",
];

/** Larger still, and sized to its box (globals.css, `.fan-xl`): the home page's group cards. */
const FAN_XL = ["z-20 fan-xl-front", "z-10 fan-xl-side fan-xl-before", "z-10 fan-xl-side fan-xl-after"];

/** Up to three real product photos fanned out on studio tiles; the category's icon only when it has none. */
export function PhotoFan({ slug, images, large = false, xl = false }: { slug?: string; images: string[]; large?: boolean; xl?: boolean }) {
  const fan = xl ? FAN_XL : large ? FAN_LARGE : FAN;
  if (images.length === 0) {
    return (
      <span className={`tile-fade flex items-center justify-center rounded-2xl ${xl ? "size-[132px]" : large ? "size-[108px]" : "size-[84px]"}`}>
        <CategoryIcon slug={slug ?? "other"} />
      </span>
    );
  }
  return (
    <>
      {images.slice(0, 3).map((src, i) => (
        <span
          key={src}
          className={`tile-fade absolute flex items-center justify-center overflow-hidden rounded-2xl p-2 shadow-card transition duration-300 ease-out ${fan[i]} ${
            i === 0 ? "group-hover:-translate-y-1 group-hover:scale-[1.04]" : ""
          }`}
        >
          {/* Hot-linked from the supplier's CDN, like every catalog photo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...shopifyImage(src, xl ? 240 : large ? 160 : 100)}
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
