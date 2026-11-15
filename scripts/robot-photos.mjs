// Prepares the two 1690 Orbit competition photos behind the home page (src/components/home-scene.tsx).
//
//   npm run robot-photos
//
// The originals sit in public/ as orbit-1690-tall.jpg (2025 Reefscape, the tall elevator robot,
// 4:3) and orbit-1690-short.jpg (2024 Crescendo, red bumpers, 3:2). They're used whole: no
// cutout, no blur. Since Nov 14, 2026 the page shows both the way they were shot (the Crescendo
// robot on the left, the Reefscape one on the right, each facing in), so this writes smaller AVIF
// and WebP copies (public/robots/<name>[-phone]-<width>.{avif,webp}).
//
// The night look is baked into those copies (Nov 14, 2026, for speed): the colour grade, the
// ultramarine tint and soft-light, the midnight shade and the soft mask that melts the edges into
// the canvas, as an alpha channel. The browser then draws a plain picture, with no CSS masks,
// filters or blend modes to recompute while the page scrolls. `look()` below is the exact maths of
// the CSS it replaced (sRGB, the W3C blend formulas); change the look here and run this again.
// The hero has two looks: "-phone" (below 1024px, at most 1,500 px wide) and the desktop one,
// which also darkens the right side behind the headline.
//
// The light theme (LM3, Nov 15, 2026) has its own copies, "-day" (public/robots/<name>[-phone]-day-<width>):
// the same photo, crop and soft mask, a brighter grade, a lighter ultramarine soft-light and
// the shade turned to an ice-white wash (soft white fades where the night ones are midnight), so
// the photo melts into the pearl sky. `npm run robot-photos -- day` writes only those (`night`
// only the night ones); home-scene.tsx shows one set or the other by the theme, in CSS.
//
// Set `mirror: true` on a photo to show it mirrored instead: a plain mirror would print "1690"
// backwards, so it then also flips every lettered patch (the bumper numbers, the Reefscape robot's
// sponsor plate) back along its own baseline, and writes public/robots/<name>-facing… files
// (home-scene.tsx would need those names).
// Drop a sharper original in under the same name, adjust the patches to it, and run it again.
//
// The Crescendo photo's original is only 1,497 px wide but the hero shows it up to ~2,600 px, so
// its copies come from public/orbit-1690-short-hd.jpg (3,000 px): the original enlarged 4x with
// Real-ESRGAN x4plus (Qualcomm AI Hub's ONNX release, run locally in 128 px tiles with blended
// overlaps), then brought down to 3,000 px. Nothing in the picture was added, moved or removed.
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
 * centre (the tall photo is drawn at 106%), so they're read at the frame point each pixel lands on.
 * `daylight()` turns a look into its light-theme copy.
 */
const NIGHT_LOOKS = {
  "orbit-1690-short": (desktop) => ({
    scale: 1,
    filter: { brightness: 0.8, contrast: 1.06, saturate: 1.05 },
    tint: ramp([[0, 0.75], [0.56, 0.55], [0.64, 0]]),
    shade: (x, y) => {
      const down = ramp([[0, 1], [0.42, 0.78], [0.58, 0.3], [0.66, 0]])(y);
      if (!desktop) return down;
      const side = ramp([[0, 0.7], [0.3, 0.3], [0.44, 0]])(1 - x);
      return 1 - (1 - down) * (1 - side);
    },
    mask: (() => {
      const fade = ramp([[0.3, 0], [0.54, 1], [0.86, 1], [0.99, 0]]);
      const lobes = union([
        ellipse(0.24, 0.28, 0.45, 0.74, [[0.42, 1], [0.7, 0.55], [1, 0]]),
        ellipse(0.15, 0.13, 0.36, 0.54, [[0, 0.55], [1, 0]]),
        ellipse(0.24, 0.08, 0.62, 0.87, [[0, 0.6], [1, 0]]),
        ellipse(0.26, 0.2, 0.62, 0.7, [[0, 0.22], [1, 0]]),
        ellipse(0.1, 0.2, 0.28, 0.76, [[0, 0.65], [1, 0]]),
      ]);
      return (x, y) => fade(y) * lobes(x, y);
    })(),
  }),
  "orbit-1690-tall": () => ({
    scale: 1.06,
    filter: { brightness: 0.92, contrast: 1.05, saturate: 1 },
    tint: null,
    shade: (() => {
      const ring = ellipse(0.16, 0.34, 0.63, 0.52, [[0.66, 0], [1, 0.45]]);
      const band = ramp([[0.08, 0], [0.18, 1], [0.46, 1], [0.6, 0]]);
      return (x, y) => ring(x, y) * band(y);
    })(),
    mask: (() => {
      const fade = ramp([[0.25, 0], [0.33, 1], [0.98, 1], [1, 0]]);
      const hfade = ramp([[0.17, 0.2], [0.27, 1]]);
      const lobes = union([
        ellipse(0.2, 0.44, 0.62, 0.64, [[0.66, 1], [1, 0]]),
        ellipse(0.26, 0.26, 0.36, 0.56, [[0.25, 0.85], [1, 0]]),
        ellipse(0.3, 0.14, 0.58, 0.28, [[0, 0.4], [1, 0]]),
        ellipse(0.34, 0.08, 0.5, 0.88, [[0, 0.6], [1, 0]]),
        ellipse(0.12, 0.16, 0.14, 0.4, [[0, 0.3], [1, 0]]),
      ]);
      return (x, y) => fade(y) * hfade(1 - x) * lobes(x, y);
    })(),
  }),
};
const LOOKS = {
  night: NIGHT_LOOKS,
  day: {
    "orbit-1690-short": (desktop) => daylight(NIGHT_LOOKS["orbit-1690-short"](desktop), { brightness: 1.04, contrast: 1.02, saturate: 1.02 }),
    "orbit-1690-tall": () => daylight(NIGHT_LOOKS["orbit-1690-tall"](), { brightness: 0.97, contrast: 1.04, saturate: 1.02, grade: 0.16, shade: 0.3 }),
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

/**
 * Lettered patches, in the ORIGINAL photo's pixels: the centre, the slope of the text's baseline
 * (letters stay upright in the photo, so a receding side keeps its slope), how far the text reaches
 * left and right and up and down from the centre, and a soft edge, all in pixels.
 * `outputs`: each set of copies, its file-name suffix, its widths and whether it takes the desktop look.
 */
const PHOTOS = {
  "orbit-1690-tall": {
    // Shown from 1024px only.
    outputs: [{ suffix: "", widths: [960, 1600, 2000], desktop: true }],
    mirror: false,
    patches: [
      // The sponsor plate and the front bumper's "1690".
      { c: [1274, 1361], slope: 0, half: [182, 78], soft: 12 },
      // "1690" on the bumper's left side, receding.
      { c: [1022, 1382], slope: 0.6, half: [17, 23], soft: 2.5 },
    ],
  },
  "orbit-1690-short": {
    // From the AI-enlarged master (see the top of this file), at a higher encode quality.
    master: "public/orbit-1690-short-hd.jpg",
    outputs: [
      // Phones and tablets: never more than 1,500 px, so a phone never fetches the 3,000 px copy.
      { suffix: "-phone", widths: [800, 1500], desktop: false },
      { suffix: "", widths: [1500, 2200, 3000], desktop: true },
    ],
    quality: { avif: 68, webp: 88 },
    mirror: false,
    // Patches are in the original's pixels (1,497 px wide); double them to mirror the 3,000 px master.
    patches: [
      // "1690" across the front bumper.
      { c: [729, 826], slope: 0, half: [68, 22], soft: 6 },
      // "1690" on the side bumper, receding.
      { c: [550, 784], slope: 0.82, half: [21, 19.5], soft: 2.5 },
    ],
  },
};

const smooth = (edge, soft, x) => Math.min(1, Math.max(0, (edge - x) / soft + 0.5));

/**
 * Flips one patch of the mirrored image back along its own baseline: each point takes the colour
 * of the point as far the other way along the baseline, at the same height above it.
 */
function unmirrorPatch(px, width, height, { c, slope, half, soft }) {
  const cx = width - 1 - c[0];
  const cy = c[1];
  const m = -slope; // the baseline's slope, mirrored
  const src = Buffer.from(px);
  const reachX = half[0] + soft;
  const reachY = half[1] + Math.abs(m) * half[0] + soft;
  for (let y = Math.max(0, Math.floor(cy - reachY)); y <= Math.min(height - 1, Math.ceil(cy + reachY)); y++) {
    for (let x = Math.max(0, Math.floor(cx - reachX)); x <= Math.min(width - 1, Math.ceil(cx + reachX)); x++) {
      const dx = x - cx;
      const up = y - cy - m * dx; // height above the baseline through the centre
      const a = smooth(half[0], soft, Math.abs(dx)) * smooth(half[1], soft, Math.abs(up));
      if (a <= 0) continue;
      const sx = cx - dx;
      const sy = y - 2 * m * dx;
      const x0 = Math.min(width - 2, Math.max(0, Math.floor(sx)));
      const y0 = Math.min(height - 2, Math.max(0, Math.floor(sy)));
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (y * width + x) * 3;
      for (let k = 0; k < 3; k++) {
        const at = (xx, yy) => src[(yy * width + xx) * 3 + k];
        const v =
          at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
        px[o + k] = Math.round(src[o + k] * (1 - a) + v * a);
      }
    }
  }
}


/** Which copies to write: `night`, `day` or (no argument) both. */
const only = process.argv[2];
const themes = only ? [only] : ["night", "day"];
if (!themes.every((t) => t in LOOKS)) throw new Error(`Unknown look "${only}": night or day`);

mkdirSync("public/robots", { recursive: true });
for (const [name, { outputs, mirror, patches, master }] of Object.entries(PHOTOS)) {
  let source = sharp(master ?? `public/${name}.jpg`).rotate();
  let out = `public/robots/${name}`;
  if (mirror) {
    const { data, info } = await source.flop().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const p of patches) unmirrorPatch(data, info.width, info.height, p);
    const raw = { raw: { width: info.width, height: info.height, channels: 3 } };
    out += "-facing";
    await sharp(data, raw).jpeg({ quality: 86, mozjpeg: true }).toFile(`${out}.jpg`);
    source = sharp(data, raw);
  }
  const { width: full } = await source.metadata();
  const q = PHOTOS[name].quality ?? { avif: 55, webp: 78 };
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
    console.log(`${out}${suffix}${tag}-{${widths.join(",")}}.{avif,webp}${mirror ? " (mirrored)" : ""}`);
  }
}
