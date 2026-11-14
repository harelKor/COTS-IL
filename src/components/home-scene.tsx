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

export function ScenePhoto({ kind }: { kind: keyof typeof PHOTOS }) {
  const p = PHOTOS[kind];
  const hero = kind === "short";
  const fallback = p.sources[p.sources.length - 1];
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
          <picture>
            {p.sources.flatMap((src) =>
              (["avif", "webp"] as const).map((type) => (
                <source
                  key={`${src.name}-${type}`}
                  type={`image/${type}`}
                  media={src.media}
                  srcSet={srcSet(src.name, src.widths, type)}
                  sizes={src.sizes}
                />
              )),
            )}
            <img
              src={`/robots/${fallback.name}-${fallback.widths[1]}.webp`}
              alt=""
              width={p.width}
              height={p.height}
              decoding="async"
              loading={hero ? "eager" : "lazy"}
              fetchPriority={hero ? "high" : "low"}
              className="scene-img"
            />
          </picture>
        </div>
      </div>
    </>
  );
}
