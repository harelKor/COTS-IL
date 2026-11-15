import { preload } from "react-dom";

/**
 * Team 1690 Orbit's two competition photos behind the home page, whole and sharp: no cutout, no
 * blur and no mirroring, so "1690", "FIRST" and the sponsor names read naturally. globals.css
 * ("The home page as one competition photograph") places them, laid out the way Hebrew reads
 * (headline on the right); their night look and soft edges are baked into the files
 * (`npm run robot-photos`), so the browser only draws a picture:
 * - "short" (2024 Crescendo, 3:2): the hero, large on the physical left with its shooter aiming
 *   in toward the headline; the CRESCENDO sign is off screen. Phones and tablets get their own
 *   copies, at most 1,500 px wide (a phone never fetches the 3,000 px one).
 * - "tall" (2025 Reefscape, 4:3): in the open physical-right lane beside the lower vendor cards on
 *   a desktop (the field cage off screen); not shown below 1024px.
 * Each has a daylight copy ("-day") for the light theme, the same photo with white fades (LM3).
 * Decorative, hidden from assistive tech, and absolutely placed, so nothing shifts as they load.
 * On a desktop they move a little as the page scrolls (globals.css, ScrollParallax).
 */
type Source = { name: string; widths: readonly number[]; sizes: string; media?: string };
const PHOTOS: Record<"short" | "tall", { sources: Source[]; width: number; height: number }> = {
  short: {
    sources: [
      { name: "orbit-1690-short", widths: [1500, 2200, 3000], sizes: "132vw", media: "(min-width: 1024px)" },
      { name: "orbit-1690-short-phone", widths: [800, 1500], sizes: "(min-width: 640px) 150vw, 250vw" },
    ],
    // The <img> fallback (the phone copy at 1,500 px).
    width: 1500,
    height: 1000,
  },
  tall: {
    sources: [{ name: "orbit-1690-tall", widths: [960, 1600, 2000], sizes: "100vw" }],
    width: 1600,
    height: 1202,
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
