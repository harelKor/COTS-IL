/**
 * Team 1690 Orbit's two competition photos behind the home page, whole and sharp: no cutout, no
 * blur and no mirroring, so "1690", "FIRST" and the sponsor names read naturally. globals.css
 * ("The home page as one competition photograph") places, masks and colour-grades them so their
 * edges melt into the midnight canvas, laid out the way Hebrew reads (headline on the right):
 * - "short" (2024 Crescendo, public/orbit-1690-short.jpg, 3:2): the hero, large on the physical
 *   left with its shooter aiming in toward the headline; the CRESCENDO sign is off screen.
 * - "tall" (2025 Reefscape, public/orbit-1690-tall.jpg, 4:3): in the open physical-right lane beside
 *   the lower vendor cards on a desktop (the field cage off screen); not shown below 1024px.
 * Smaller copies come from `npm run robot-photos`. Decorative, hidden from assistive tech, and
 * absolutely placed, so nothing shifts as they load. ScrollParallax moves them a little.
 */
const PHOTOS = {
  short: {
    name: "orbit-1690-short",
    widths: [800, 1500, 2200, 3000],
    width: 1497,
    height: 998,
    sizes: "(min-width: 1024px) 132vw, 250vw",
  },
  tall: {
    name: "orbit-1690-tall",
    widths: [960, 1600, 2000],
    width: 2000,
    height: 1502,
    sizes: "(min-width: 1024px) 100vw, 190vw",
  },
} as const;

const srcSet = (
  name: string,
  widths: readonly number[],
  type: "avif" | "webp",
) => widths.map((w) => `/robots/${name}-${w}.${type} ${w}w`).join(", ");

export function ScenePhoto({ kind }: { kind: keyof typeof PHOTOS }) {
  const p = PHOTOS[kind];
  const hero = kind === "short";
  return (
    <>
      {/* Paint from the photo splashing unevenly across the open canvas beside it. */}
      <div
        aria-hidden
        className={`scene-splash scene-splash-${kind} pointer-events-none absolute -z-10`}
      />
      {/* The box clips to the window; the frame inside holds the photo at its own shape, masked. */}
      <div
        aria-hidden
        data-parallax={hero ? "zoom" : "drift"}
        className={`scene-photo scene-photo-${kind} pointer-events-none absolute -z-10`}
      >
        <div className="scene-frame">
          <picture>
            <source
              type="image/avif"
              srcSet={srcSet(p.name, p.widths, "avif")}
              sizes={p.sizes}
            />
            <source
              type="image/webp"
              srcSet={srcSet(p.name, p.widths, "webp")}
              sizes={p.sizes}
            />
            <img
              src={`/${p.name}.jpg`}
              alt=""
              width={p.width}
              height={p.height}
              decoding="async"
              loading={hero ? "eager" : "lazy"}
              fetchPriority={hero ? "high" : "low"}
              className="scene-img"
            />
          </picture>
          {hero && <div className="scene-tint absolute inset-0" />}
          <div className="scene-shade absolute inset-0" />
          <div className="scene-grade absolute inset-0" />
        </div>
      </div>
    </>
  );
}
