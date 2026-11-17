import { preload } from "react-dom";

/**
 * Two competition photos behind the home page, whole and sharp: the competition itself, field
 * elements and several teams' robots (no cutout, no blur and never mirrored, so the team numbers
 * read naturally). globals.css ("The home page as one competition photograph") places them, laid
 * out the way Hebrew reads (headline on the right); their night look and soft edges are baked into
 * the files (`npm run robot-photos`), so the browser only draws a picture:
 * - "short" (2.36:1, `home-rebuilt-hub-arc`): the hero. FRC 2026 REBUILT: a blue robot firing an
 *   orange arc of balls into the hub with its REBUILT sign, large, the robot at the window's left
 *   edge and the arc's peak just under the header; the empty field and the dark stands on the
 *   photo's right run on under the headline, which has its own blur and dim. Enlarged with
 *   Real-ESRGAN before it was graded. Phones and tablets get their own copies, softer at the edges.
 * - "tall" (4:3, `home-reef-lane`): in the open physical-right lane beside the lower vendor cards
 *   on a desktop, the 2025 Reefscape reef with its coral and algae filling it; the robot beside it
 *   stands at the window's edge, about half of it in view. Not shown below 1024px.
 * Each has a daylight copy ("-day") for the light theme, the same photo with white fades (LM3).
 * Decorative, hidden from assistive tech, and absolutely placed, so nothing shifts as they load.
 * On a desktop they move a little as the page scrolls (globals.css, ScrollParallax).
 */
type Source = { name: string; widths: readonly number[]; sizes: string; media?: string };
const PHOTOS: Record<"short" | "tall", { sources: Source[]; width: number; height: number }> = {
  short: {
    sources: [
      { name: "home-rebuilt-hub-arc", widths: [1200, 1800, 2400, 3000], sizes: "min(100vw, 155vh, 3000px)", media: "(min-width: 1024px)" },
      { name: "home-rebuilt-hub-arc-phone", widths: [1000, 2000], sizes: "(min-width: 640px) 150vw, 240vw" },
    ],
    // The <img> fallback (the phone copy at 2,000 px).
    width: 2000,
    height: 849,
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

/**
 * The FTC photo beside the home page's groups (INTO THE DEEP 2025: a robot at the high basket, its
 * slide and coiled cable; the red parts in the brand blue, the number plate dark metal, the people behind
 * blurred, all baked by `npm run robot-photos`). From 1024px a tall lane on the physical left, flush
 * with the window's edge (the photo is padded on its left and top by mirroring, blurred and shaded
 * to the canvas), the basket near the section's top and the robot near its bottom. Below that a
 * short strip of the robot over the cards. Night and day copies as above, its
 * fades baked in; decorative, and its box has the photo's shape before it loads, so nothing shifts.
 */
export function FtcPhoto() {
  return (
    <div aria-hidden data-reveal-wait className="ftc-photo pointer-events-none relative">
      {LOOKS.map((look) => (
        <picture key={look.scheme} className={look.only}>
          {(["avif", "webp"] as const).map((type) => (
            <source
              key={`lane-${type}`}
              type={`image/${type}`}
              media="(min-width: 1024px)"
              srcSet={srcSet(`home-ftc-lane${look.tag}`, [640, 965], type)}
              sizes="min(44vw, 790px)"
            />
          ))}
          <source type="image/avif" srcSet={`/robots/home-ftc-lane-phone${look.tag}-665.avif`} />
          <img
            src={`/robots/home-ftc-lane-phone${look.tag}-665.webp`}
            alt=""
            width={665}
            height={380}
            decoding="async"
            loading="lazy"
            className="ftc-img"
          />
        </picture>
      ))}
    </div>
  );
}
