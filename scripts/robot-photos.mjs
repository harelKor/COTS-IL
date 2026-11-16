// Prepares the two competition photos behind the home page (src/components/home-scene.tsx).
//
//   npm run robot-photos
//
// The home page shows the competition itself, field elements and several teams' robots, not one
// team (owner's decision, Nov 16, 2026; the photos are the owner's to use). The originals sit in
// public/ and are used whole, as shot: no cutout, no blur, never mirrored.
// - home-field-wide.jpg (3:2, 2,000 px): the hero. Israeli District Championship 2025 (Reefscape):
//   robots 1937, 2230 and 2630 hanging from the barge chains, the reef behind them, empty blue stands
//   and a light truss on the right.
// - home-reef-lane.jpg (4:3, 2,000 px): the lane beside the vendor cards on a desktop. FIRST
//   Championship 2025 (Reefscape): the reef, its purple coral branches holding white coral and teal
//   algae, the stands behind, and robot 1690 right of it (x 49-75%). The page shows the photo's
//   left 60% (globals.css), so the reef is the subject and the robot stands at the edge, partly cut off.
// This writes smaller AVIF and WebP copies (public/robots/<name>[-phone]-<width>.{avif,webp}).
//
// The night look is baked into those copies (Nov 14, 2026, for speed): the colour grade, the
// ultramarine tint and soft-light, the midnight shade and the soft mask that melts the edges into
// the canvas, as an alpha channel. The browser then draws a plain picture, with no CSS masks,
// filters or blend modes to recompute while the page scrolls. `look()` below is the exact maths of
// the CSS it replaced (sRGB, the W3C blend formulas); change the look here and run this again.
// The hero has two looks: "-phone" (below 1024px) and the desktop one, which also darkens the
// right side (the truss) behind the headline.
//
// The light theme (LM3, Nov 15, 2026) has its own copies, "-day" (public/robots/<name>[-phone]-day-<width>):
// the same photo, crop and soft mask, a brighter grade, a lighter ultramarine soft-light and
// the shade turned to an ice-white wash (soft white fades where the night ones are midnight), so
// the photo melts into the pearl sky. `npm run robot-photos -- day` writes only those (`night`
// only the night ones); home-scene.tsx shows one set or the other by the theme, in CSS.
//
// The desktop hero is drawn at most ~1,750 px wide (68vw, capped by the window's height), so the
// 2,000 px originals are sharp enough as they are. If a photo is ever shown larger than its
// original, an earlier version of this script (git log, "Real-ESRGAN") enlarged one 4x with
// Real-ESRGAN x4plus (Qualcomm AI Hub's ONNX release, run locally in 128 px tiles) into a master.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

/** An alpha ramp: [position, alpha] stops, held flat before the first and after the last. */
const ramp = (stops) => (t) => {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [p, a] = stops[i];
    if (t <= p) {
      const [p0, a0] = stops[i - 1];
      return a0 + ((a - a0) * (t - p0)) / (p - p0);
    }
  }
  return stops[stops.length - 1][1];
};
/** A CSS `radial-gradient(ellipse rx ry at cx cy, …)` in the box's 0–1 coordinates. */
const ellipse = (rx, ry, cx, cy, stops) => {
  const f = ramp(stops);
  return (x, y) => f(Math.hypot((x - cx) / rx, (y - cy) / ry));
};
/** Mask layers composited with `add` (source-over). */
const union = (layers) => (x, y) => layers.reduce((a, l) => {
  const b = l(x, y);
  return a + b - a * b;
}, 0);

const NIGHT = [2 / 255, 4 / 255, 22 / 255]; // --orbit-night
const BLUE = [0, 20 / 255, 190 / 255]; // --orbit-blue
const ICE = [238 / 255, 242 / 255, 255 / 255]; // the day sky behind the photos (globals.css, .scene-canvas in light)

/**
 * The day version of a look: the same mask and shade shapes (so the same crop and soft edges), a
 * brighter grade, the tint and the ultramarine soft-light lighter, and the shade an ice-white wash
 * (`shade` scales it: the Reefscape stands keep most of their colour, so the lane isn't a white glare).
 */
const daylight = (look, { brightness, contrast, saturate, tint = 0.85, grade = 0.1, shade = 1 }) => ({
  ...look,
  filter: { brightness, contrast, saturate },
  tint: look.tint && ((y) => tint * look.tint(y)),
  shade: (x, y) => shade * look.shade(x, y),
  shadeTo: ICE,
  grade,
});

/**
 * The look, as the CSS had it (globals.css, "The home page as one competition photograph"):
 * - filter: brightness, contrast, saturate, in that order, each clamped (sRGB, as Chromium does);
 * - tint (hero only): rgb(0 20 190) in `mix-blend-mode: color`, fading down the frame;
 * - shade: midnight overlays;
 * - grade: --orbit-blue in `soft-light` at 22%;
 * - mask: the frame's soft edges, as alpha.
 * The shade, tint and mask sit on the frame, which holds the photo scaled by `scale` about its
 * centre (the lane photo is drawn at 106%), so they're read at the frame point each pixel lands on.
 * `daylight()` turns a look into its light-theme copy.
 */
const NIGHT_LOOKS = {
  "home-field-wide": (desktop) => ({
    scale: 1,
    filter: { brightness: 0.82, contrast: 1.06, saturate: 1.04 },
    // The blue stands above the field, toward the canvas's ultramarine.
    tint: ramp([[0, 0.6], [0.14, 0.4], [0.24, 0]]),
    shade: (x, y) => {
      // Midnight over the stands at the top and the empty carpet below the bumpers.
      const top = ramp([[0, 0.75], [0.1, 0.45], [0.2, 0.1], [0.3, 0]])(y);
      const floor = ramp([[0.62, 0], [0.74, 0.35], [0.9, 0.7]])(y);
      const down = 1 - (1 - top) * (1 - floor);
      if (!desktop) return down;
      // The truss on the right, under the headline.
      const side = ramp([[0, 0.75], [0.14, 0.45], [0.3, 0]])(1 - x);
      return 1 - (1 - down) * (1 - side);
    },
    mask: (() => {
      const fadeY = ramp([[0.02, 0], [0.14, 1], [0.66, 1], [0.86, 0]]);
      const fadeX = ramp([[0, 0], [0.06, 1], [0.86, 1], [1, 0]]);
      const lobes = union([
        // The three robots and the reef.
        ellipse(0.5, 0.36, 0.48, 0.4, [[0.62, 1], [1, 0]]),
        ellipse(0.22, 0.28, 0.2, 0.48, [[0.45, 1], [1, 0]]),
        ellipse(0.22, 0.18, 0.76, 0.42, [[0.4, 1], [1, 0]]),
        // Their shadows on the carpet, and the truss.
        ellipse(0.3, 0.1, 0.4, 0.66, [[0, 0.7], [1, 0]]),
        ellipse(0.16, 0.14, 0.86, 0.3, [[0, 0.5], [1, 0]]),
      ]);
      return (x, y) => fadeY(y) * fadeX(x) * lobes(x, y);
    })(),
  }),
  "home-reef-lane": () => ({
    scale: 1.06,
    filter: { brightness: 0.92, contrast: 1.05, saturate: 1 },
    tint: null,
    shade: (() => {
      // The stands behind the reef, darker toward the top; the reef itself stays bright.
      const stands = ramp([[0, 0.9], [0.3, 0.55], [0.5, 0.35], [0.75, 0.15], [0.84, 0]]);
      const reef = ellipse(0.26, 0.4, 0.27, 0.62, [[0.5, 1], [1, 0]]);
      return (x, y) => stands(y) * (1 - reef(x, y));
    })(),
    mask: (() => {
      const fadeY = ramp([[0.1, 0], [0.28, 1], [0.97, 1], [1, 0]]);
      // Under the vendor cards on the left.
      const fadeX = ramp([[0, 0.2], [0.07, 1]]);
      const lobes = union([
        // The reef.
        ellipse(0.32, 0.46, 0.27, 0.66, [[0.6, 1], [1, 0]]),
        // The field behind it, toward the window's edge, and the reef's base.
        ellipse(0.2, 0.3, 0.45, 0.6, [[0.3, 0.8], [1, 0]]),
        ellipse(0.3, 0.1, 0.3, 0.92, [[0, 0.8], [1, 0]]),
        // The robot's elevator and bumper, at the window's edge.
        ellipse(0.12, 0.32, 0.62, 0.64, [[0.3, 0.9], [1, 0]]),
        ellipse(0.18, 0.08, 0.58, 0.91, [[0.3, 0.9], [1, 0]]),
      ]);
      return (x, y) => fadeY(y) * fadeX(x) * lobes(x, y);
    })(),
  }),
};
const LOOKS = {
  night: NIGHT_LOOKS,
  day: {
    "home-field-wide": (desktop) => daylight(NIGHT_LOOKS["home-field-wide"](desktop), { brightness: 1.04, contrast: 1.02, saturate: 1.02 }),
    "home-reef-lane": () => daylight(NIGHT_LOOKS["home-reef-lane"](), { brightness: 0.97, contrast: 1.04, saturate: 1.02, grade: 0.16, shade: 0.3 }),
  },
};

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
/** W3C `color` blend: the source's hue and saturation at the backdrop's luminosity. */
function colorBlend(cb, cs) {
  const d = lum(...cb) - lum(...cs);
  let c = cs.map((v) => v + d);
  const l = lum(...c);
  const n = Math.min(...c);
  const x = Math.max(...c);
  if (n < 0) c = c.map((v) => l + ((v - l) * l) / (l - n));
  if (x > 1) c = c.map((v) => l + ((v - l) * (1 - l)) / (x - l));
  return c;
}
/** W3C `soft-light`. */
const softLight = (b, s) =>
  s <= 0.5 ? b - (1 - 2 * s) * b * (1 - b) : b + (2 * s - 1) * ((b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)) - b);

/** RGB pixels in, RGBA pixels out, with the look baked in. */
function bake(rgb, width, height, look) {
  const out = Buffer.alloc(width * height * 4);
  const { brightness, contrast, saturate: s } = look.filter;
  const tintCache = new Map();
  for (let y = 0; y < height; y++) {
    const fy = 0.5 + look.scale * ((y + 0.5) / height - 0.5);
    for (let x = 0; x < width; x++) {
      const fx = 0.5 + look.scale * ((x + 0.5) / width - 0.5);
      const o = (y * width + x) * 4;
      const inside = fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1;
      const alpha = inside ? look.mask(fx, fy) : 0;
      if (alpha <= 0) continue;
      const i = (y * width + x) * 3;
      let c = [rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255];
      c = c.map((v) => clamp(v * brightness));
      c = c.map((v) => clamp((v - 0.5) * contrast + 0.5));
      if (s !== 1) {
        const [r, g, b] = c;
        c = [
          clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
          clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
          clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
        ];
      }
      if (look.tint) {
        let a = tintCache.get(y);
        if (a === undefined) tintCache.set(y, (a = look.tint(fy)));
        if (a > 0) {
          const m = colorBlend(c, BLUE);
          c = c.map((v, k) => (1 - a) * v + a * m[k]);
        }
      }
      const sh = look.shade(fx, fy);
      const to = look.shadeTo ?? NIGHT;
      if (sh > 0) c = c.map((v, k) => (1 - sh) * v + sh * to[k]);
      const g = look.grade ?? 0.22;
      c = c.map((v, k) => (1 - g) * v + g * softLight(v, BLUE[k]));
      out[o] = Math.round(c[0] * 255);
      out[o + 1] = Math.round(c[1] * 255);
      out[o + 2] = Math.round(c[2] * 255);
      out[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/** Each set of copies: its file-name suffix, its widths and whether it takes the desktop look. */
const PHOTOS = {
  "home-field-wide": {
    outputs: [
      // Phones and tablets: never more than 1,400 px.
      { suffix: "-phone", widths: [800, 1400], desktop: false },
      { suffix: "", widths: [1000, 1500, 2000], desktop: true },
    ],
    quality: { avif: 62, webp: 84 },
  },
  // Shown from 1024px only.
  "home-reef-lane": { outputs: [{ suffix: "", widths: [1000, 1500, 2000], desktop: true }] },
};

/** Which copies to write: `night`, `day` or (no argument) both. */
const only = process.argv[2];
const themes = only ? [only] : ["night", "day"];
if (!themes.every((t) => t in LOOKS)) throw new Error(`Unknown look "${only}": night or day`);

mkdirSync("public/robots", { recursive: true });
for (const [name, { outputs, quality }] of Object.entries(PHOTOS)) {
  const source = sharp(`public/${name}.jpg`).rotate();
  const out = `public/robots/${name}`;
  const { width: full } = await source.metadata();
  const q = quality ?? { avif: 55, webp: 78 };
  for (const [theme, { suffix, widths, desktop }] of themes.flatMap((t) => outputs.map((o) => [t, o]))) {
    const look = LOOKS[theme][name](desktop);
    const tag = theme === "day" ? "-day" : "";
    for (const width of widths) {
      const { data, info } = await source
        .clone()
        .resize({ width: Math.min(width, full ?? width), kernel: "lanczos3", withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const img = sharp(bake(data, info.width, info.height, look), {
        raw: { width: info.width, height: info.height, channels: 4 },
      });
      const file = `${out}${suffix}${tag}-${width}`;
      await img.clone().avif({ quality: q.avif, effort: 6, chromaSubsampling: "4:4:4" }).toFile(`${file}.avif`);
      await img.clone().webp({ quality: q.webp, alphaQuality: 90, smartSubsample: true }).toFile(`${file}.webp`);
    }
    console.log(`${out}${suffix}${tag}-{${widths.join(",")}}.{avif,webp}`);
  }
}
