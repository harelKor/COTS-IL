/**
 * Team 1690 Orbit's two competition photos behind the home page, whole and sharp: no cutout and
 * no blur. globals.css ("The home page as one competition photograph") places, masks and
 * colour-grades them so their edges melt into the navy canvas:
 * - "tall" (2025 Reefscape, public/orbit-1690-tall.jpg, 4:3): full width on the right, from
 *   under the navbar; it sits at the bottom of the hero, so the blue 1690 bumpers end just above
 *   "מאיזה ספק קונים?".
 * - "short" (2024 Crescendo, public/orbit-1690-short.jpg, 3:2): in the open left lane beside the
 *   lower vendor cards on a desktop, in a window between the vendor groups on phones.
 * Smaller copies come from `npm run robot-photos`. Decorative, hidden from assistive tech, and
 * absolutely placed, so nothing shifts as they load. ScrollParallax moves them a little.
 */
const PHOTOS = {
  tall: { name: "orbit-1690-tall", widths: [960, 1600, 2000], width: 2000, height: 1502, sizes: "(min-width: 1024px) 100vw, 200vw" },
  short: { name: "orbit-1690-short", widths: [800, 1500], width: 1497, height: 998, sizes: "(min-width: 1024px) 78vw, 125vw" },
} as const;

const srcSet = (name: string, widths: readonly number[], type: "avif" | "webp") =>
  widths.map((w) => `/robots/${name}-${w}.${type} ${w}w`).join(", ");

export function ScenePhoto({ kind }: { kind: keyof typeof PHOTOS }) {
  const p = PHOTOS[kind];
  const hero = kind === "tall";
  return (
    <>
      {!hero && <div aria-hidden className="scene-warm pointer-events-none absolute -z-10" />}
      <div aria-hidden data-parallax={hero ? "zoom" : "drift"} className={`scene-photo scene-photo-${kind} pointer-events-none absolute -z-10`}>
        <picture>
          <source type="image/avif" srcSet={srcSet(p.name, p.widths, "avif")} sizes={p.sizes} />
          <source type="image/webp" srcSet={srcSet(p.name, p.widths, "webp")} sizes={p.sizes} />
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
        {hero && <div className="scene-crowd absolute inset-0" />}
        {hero && <div className="scene-vignette absolute inset-0" />}
        <div className="scene-grade absolute inset-0" />
      </div>
    </>
  );
}
