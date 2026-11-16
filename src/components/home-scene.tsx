import { preload } from "react-dom";

/**
 * Two competition photos behind the home page, whole and sharp: the competition itself and its
 * field elements (no cutout, no blur and never mirrored, so any text reads naturally). globals.css ("The home page as one competition photograph") places them, laid
 * out the way Hebrew reads (headline on the right); their night look and soft edges are baked into
 * the files (`npm run robot-photos`), so the browser only draws a picture:
 * - "short" (3:2, `hero-field`): the hero, a window-wide backdrop. FIRST Championship Detroit 2019,
 *   an empty Deep Space field shot low from the floor: the field on the physical left, the open floor
 *   running right under the hero and feathering into the vendors, a directional wash (baked in) over
 *   the top right behind the headline. Team-neutral: no robots, no team numbers. Phones and tablets
 *   get their own copies, at most 1,400 px wide.
 * - "tall" (4:3, `home-reef-lane`): in the open physical-right lane beside the lower vendor cards
 *   on a desktop, the 2025 Reefscape reef with its coral and algae filling it; the robot beside it
 *   stands at the window's edge, partly cut off. Not shown below 1024px.
 * Each has a daylight copy ("-day") for the light theme, the same photo with white fades (LM3).
 * Decorative, hidden from assistive tech, and absolutely placed, so nothing shifts as they load.
 * On a desktop they move a little as the page scrolls (globals.css, ScrollParallax).
 */
type Source = { name: string; widths: readonly number[]; sizes: string; media?: string };
const PHOTOS: Record<"short" | "tall", { sources: Source[]; width: number; height: number }> = {
  short: {
    sources: [
      { name: "hero-field", widths: [1000, 1500, 2000], sizes: "106vw", media: "(min-width: 1024px)" },
      { name: "hero-field-phone", widths: [800, 1400], sizes: "(min-width: 640px) 120vw, 150vw" },
    ],
    // The <img> fallback (the phone copy at 1,400 px).
    width: 1400,
    height: 934,
  },
  tall: {
    sources: [{ name: "home-reef-lane", widths: [1000, 1500, 2000], sizes: "(max-width: 1279px) 100vw, 84vw" }],
    width: 1500,
    height: 1127,
  },
};

const srcSet = (
  name: string,
  widths: readonly number[],
  type: "avif" | "webp",
) => widths.map((w) => `/robots/${name}-${w}.${type} ${w}w`).join(", ");

/** The two sets of copies: the night look, and its daylight version for the light theme (LM3). */
const LOOKS = [
  { tag: "", only: "only-dark", scheme: "dark" },
  { tag: "-day", only: "only-light", scheme: "light" },
] as const;

/**
 * The hero photo is lazy (so the theme's hidden copy is never fetched), which hides it from the
 * browser's early scan: these preloads fetch the copy the device's light/dark setting will show,
 * as early as an eager image would be. A visitor whose saved choice differs from the device's gets
 * theirs a moment later, from the lazy image.
 */
function preloadHero() {
  const p = PHOTOS.short;
  for (const look of LOOKS) {
    for (const src of p.sources) {
      const width = src.media ?? "(max-width: 1023px)";
      const name = `${src.name}${look.tag}`;
      preload(`/robots/${name}-${src.widths[0]}.avif`, {
        as: "image",
        type: "image/avif",
        imageSrcSet: srcSet(name, src.widths, "avif"),
        imageSizes: src.sizes,
        media: `${width} and (prefers-color-scheme: ${look.scheme})`,
        fetchPriority: "high",
      });
    }
  }
}

export function ScenePhoto({ kind }: { kind: keyof typeof PHOTOS }) {
  const p = PHOTOS[kind];
  const hero = kind === "short";
  const fallback = p.sources[p.sources.length - 1];
  if (hero) preloadHero();
  return (
    <>
      {/* Paint from the photo splashing unevenly across the open canvas beside it. */}
      <div
        aria-hidden
        className={`scene-splash scene-splash-${kind} pointer-events-none absolute -z-10`}
      />
      {/* The box clips to the window; the frame inside holds the photo at its own shape. */}
      <div
        aria-hidden
        data-parallax={hero ? "zoom" : "drift"}
        className={`scene-photo scene-photo-${kind} pointer-events-none absolute -z-10`}
      >
        <div className="scene-frame">
          {/*
            Night and day copies, one hidden by the theme in CSS (.only-dark/.only-light, as the
            vendor logos), so no script decides and nothing flashes. Both lazy: a hidden lazy image
            is never fetched.
          */}
          {LOOKS.map((look) => {
            const name = (n: string) => `${n}${look.tag}`;
            return (
              <picture key={look.scheme} className={look.only}>
                {p.sources.flatMap((src) =>
                  (["avif", "webp"] as const).map((type) => (
                    <source
                      key={`${src.name}-${type}`}
                      type={`image/${type}`}
                      media={src.media}
                      srcSet={srcSet(name(src.name), src.widths, type)}
                      sizes={src.sizes}
                    />
                  )),
                )}
                <img
                  src={`/robots/${name(fallback.name)}-${fallback.widths[1]}.webp`}
                  alt=""
                  width={p.width}
                  height={p.height}
                  decoding="async"
                  loading="lazy"
                  fetchPriority={hero ? "high" : "low"}
                  className="scene-img"
                />
              </picture>
            );
          })}
        </div>
      </div>
    </>
  );
}
