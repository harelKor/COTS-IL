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
//   left 60% (globals.css), so the reef is the subject and the robot stands at the edge, partly cut off;
//   only its left edge is faded here; its top fades in CSS, in a straight line under the first vendor row.
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
      const stands = ramp([[0, 0.75], [0.2, 0.5], [0.5, 0.3], [0.75, 0.12], [0.84, 0]]);
      const reef = ellipse(0.26, 0.4, 0.27, 0.62, [[0.5, 1], [1, 0]]);
      return (x, y) => stands(y) * (1 - reef(x, y));
    })(),
    mask: (() => {
      // The top fade is in CSS (globals.css, .scene-photo-tall): one straight line under the first row.
      const fadeY = ramp([[0.97, 1], [1, 0]]);
      // Under the vendor cards on the left.
      const fadeX = ramp([[0, 0], [0.12, 1]]);
      // Nothing else: the photo stays whole to the window's right edge and the lane's bottom, so the
      // robot at the edge shows as shot and no corner fades out.
      return (x, y) => fadeY(y) * fadeX(x);
    })(),
  }),
  /**
   * The FTC lane (home-ftc-lane.webp, 665 x 998, portrait): INTO THE DEEP 2025, a robot at the high
   * basket with its tall silver slide and coiled cable, a referee and spectators behind. `prepFtc`
   * has already recoloured it and blurred the people, so the look only grades and fades it. On a
   * desktop its right edge melts into the group cards beside it, its top and bottom into the canvas.
   */
  "home-ftc-lane": (desktop) => ({
    scale: 1,
    filter: { brightness: 0.86, contrast: 1.06, saturate: 1 },
    // The blurred stands toward the canvas's ultramarine.
    tint: desktop ? ramp([[0, 0.5], [0.3, 0.3], [0.6, 0]]) : ramp([[0, 0.3], [0.5, 0]]),
    shade: desktop
      ? (x, y) => {
          const top = ramp([[0, 0.55], [0.12, 0.25], [0.3, 0]])(y);
          const floor = ramp([[0.86, 0], [1, 0.5]])(y);
          return 1 - (1 - top) * (1 - floor);
        }
      : () => 0.08,
    mask: desktop
      ? (() => {
          const fadeY = ramp([[0, 0], [0.07, 1], [0.86, 1], [0.99, 0]]);
          const fadeX = ramp([[0, 0], [0.1, 1], [0.62, 1], [0.98, 0]]);
          // The basket, slide and robot; the corners fall away.
          const body = ellipse(0.72, 0.7, 0.42, 0.5, [[0.7, 1], [1, 0]]);
          return (x, y) => fadeY(y) * fadeX(x) * body(x, y);
        })()
      : (() => {
          // The phone strip (the robot, cropped): soft on every side.
          const fadeY = ramp([[0, 0], [0.22, 1], [0.78, 1], [1, 0]]);
          const fadeX = ramp([[0, 0], [0.16, 1], [0.84, 1], [1, 0]]);
          return (x, y) => fadeY(y) * fadeX(x);
        })(),
  }),
};
const LOOKS = {
  night: NIGHT_LOOKS,
  day: {
    "home-field-wide": (desktop) => daylight(NIGHT_LOOKS["home-field-wide"](desktop), { brightness: 1.04, contrast: 1.02, saturate: 1.02 }),
    "home-reef-lane": () => daylight(NIGHT_LOOKS["home-reef-lane"](), { brightness: 0.97, contrast: 1.04, saturate: 1.02, grade: 0.16, shade: 0.3 }),
    "home-ftc-lane": (desktop) =>
      daylight(NIGHT_LOOKS["home-ftc-lane"](desktop), { brightness: 1.06, contrast: 1.02, saturate: 1, tint: 0.6, grade: 0.12, shade: 0.7 }),
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

/** Filled polygons ([x, y] points, in source pixels) as a 0-255 mask, feathered by a blur of `soft` px. */
async function polygonMask(w, h, polygons, soft) {
  const m = Buffer.alloc(w * h);
  for (const poly of polygons) {
    for (let y = 0; y < h; y++) {
      const py = y + 0.5;
      const xs = [];
      for (let i = 0; i < poly.length; i++) {
        const [x0, y0] = poly[i];
        const [x1, y1] = poly[(i + 1) % poly.length];
        if ((y0 <= py && y1 > py) || (y1 <= py && y0 > py)) xs.push(x0 + ((py - y0) * (x1 - x0)) / (y1 - y0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x < Math.min(w, xs[k + 1] - 0.5); x++) m[y * w + x] = 255;
      }
    }
  }
  if (!soft) return m;
  return sharp(m, { raw: { width: w, height: h, channels: 1 } }).blur(soft).extractChannel(0).raw().toBuffer();
}
const blurred = (rgb, w, h, sigma) => sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).blur(sigma).raw().toBuffer();

/**
 * The FTC photo before its look, in source pixels (665 x 998), from drawn regions rather than hue
 * alone (hue alone would catch skin, the brown trousers and the orange-yellow samples):
 * - sharp: the basket, its pole, the lower bin, the claw, cable and slide, and the robot and field
 *   below the wall's rail. Everything else (the referee and spectators) is blurred, darkened and
 *   flattened, so no face is recognisable and the referee's stripes go quiet.
 * - red: the red basket pole and the floor tape turn brand blue (their red pixels only).
 * - plate: the number plate becomes an even blue plate, its digits blurred into it.
 * The yellow samples, green claw tips and yellow wheels sit outside `red` and keep their colours.
 */
const FTC = {
  sharp: [
    // The high basket with its samples, and the red cap on its pole.
    [[72, 22], [258, 32], [254, 160], [94, 162]],
    // The pole, red and silver, leaning right toward the floor.
    [[102, 22], [145, 22], [176, 664], [120, 664]],
    // The lower bin.
    [[94, 352], [268, 352], [268, 484], [98, 484]],
    // The claw at the top, a diagonal band; the referee's face behind it stays soft.
    [[216, 0], [276, 0], [300, 38], [342, 42], [342, 64], [300, 74], [264, 92], [238, 72]],
    // The coiled cable.
    [[251, 66], [281, 66], [282, 646], [250, 646]],
    // The slide, and its carriage near the floor.
    [[296, 60], [312, 60], [312, 446], [296, 446]],
    [[272, 446], [322, 446], [322, 640], [272, 640]],
    // The robot, the field wall and the floor below the rail; the people behind the clear wall on the right stay soft.
    [[24, 652], [160, 616], [665, 590], [665, 612], [630, 616], [630, 806], [665, 810], [665, 998], [24, 998]],
  ],
  red: [
    [[98, 20], [152, 20], [152, 664], [114, 664]],
    [[196, 862], [256, 862], [256, 900], [196, 900]],
  ],
  plate: [[[281, 736], [393, 736], [393, 798], [281, 798]]],
};
/** The brand blue the red parts take, a little lighter than --orbit-blue so it reads as blue on a dark robot. */
const PART_BLUE = [0.05, 0.16, 0.95];

async function prepFtc(rgb, w, h, theme) {
  const [sharpM, redM, plateM, back, plateBlur] = await Promise.all([
    polygonMask(w, h, FTC.sharp, 2.2),
    polygonMask(w, h, FTC.red, 1.2),
    polygonMask(w, h, FTC.plate, 1.5),
    blurred(rgb, w, h, 9),
    blurred(rgb, w, h, 7),
  ]);
  const out = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const i = p * 3;
    let c = [rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255];
    const r = redM[p] / 255;
    if (r > 0) {
      const [R, G, B] = c;
      const a = r * clamp((R - Math.max(G, B) * 1.25) / 0.25);
      if (a > 0) {
        const m = colorBlend(c.map((v) => clamp(v * 1.35)), PART_BLUE);
        c = c.map((v, k) => (1 - a) * v + a * m[k]);
      }
    }
    const pl = plateM[p] / 255;
    if (pl > 0) {
      // Darker toward its lower edge, like the lit plate it was.
      const l = 0.11 + 0.06 * lum(plateBlur[i] / 255, plateBlur[i + 1] / 255, plateBlur[i + 2] / 255) - 0.03 * ((p / w - 736) / 62);
      // Muted, so it reads as a painted plate rather than a lit screen.
      const plate = colorBlend([l, l, l], PART_BLUE).map((v) => 0.55 * v + 0.45 * l);
      c = c.map((v, k) => (1 - pl) * v + pl * plate[k]);
    }
    const s = sharpM[p] / 255;
    if (s < 1) {
      // The people: the blurred copy, its contrast halved, darker by night and washed toward the ice sky by day.
      const flat = [back[i], back[i + 1], back[i + 2]].map((v, k) => {
        const f = clamp(0.5 + (v / 255 - 0.5) * 0.45);
        return theme === "day" ? 0.55 * f + 0.45 * ICE[k] : f * 0.55;
      });
      c = c.map((v, k) => s * v + (1 - s) * flat[k]);
    }
    out[i] = Math.round(c[0] * 255);
    out[i + 1] = Math.round(c[1] * 255);
    out[i + 2] = Math.round(c[2] * 255);
  }
  return out;
}

/** Each set of copies: its file-name suffix, its widths, whether it takes the desktop look, and a crop. */
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
  // 665 px is all there is (no larger copy; the page draws it at most 520 CSS px wide). No AI
  // upscaler was at hand, so it isn't enlarged. The phone strip is the robot, cropped.
  "home-ftc-lane": {
    file: "public/home-ftc-lane.webp",
    prep: prepFtc,
    outputs: [
      { suffix: "", widths: [440, 665], desktop: true },
      { suffix: "-phone", widths: [665], desktop: false, crop: { left: 0, top: 560, width: 665, height: 380 } },
    ],
    quality: { avif: 64, webp: 86 },
  },
};

/** Which copies to write: `night`, `day` or `all`/nothing for both; a second argument names one photo. */
const only = process.argv[2] && process.argv[2] !== "all" ? process.argv[2] : null;
const themes = only ? [only] : ["night", "day"];
if (!themes.every((t) => t in LOOKS)) throw new Error(`Unknown look "${only}": night or day`);
const onePhoto = process.argv[3];

mkdirSync("public/robots", { recursive: true });
for (const [name, { file, prep, outputs, quality }] of Object.entries(PHOTOS)) {
  if (onePhoto && name !== onePhoto) continue;
  const original = sharp(file ?? `public/${name}.jpg`).rotate();
  const { width: full } = await original.metadata();
  /** The photo before its look, per theme when it has a `prep` step. */
  const prepped = new Map();
  const sourceFor = async (theme) => {
    if (!prep) return original;
    if (!prepped.has(theme)) {
      const { data, info } = await original.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
      prepped.set(theme, sharp(await prep(data, info.width, info.height, theme), { raw: { width: info.width, height: info.height, channels: 3 } }));
    }
    return prepped.get(theme);
  };
  const out = `public/robots/${name}`;
  const q = quality ?? { avif: 55, webp: 78 };
  for (const [theme, { suffix, widths, desktop, crop }] of themes.flatMap((t) => outputs.map((o) => [t, o]))) {
    const look = LOOKS[theme][name](desktop);
    const source = await sourceFor(theme);
    const tag = theme === "day" ? "-day" : "";
    for (const width of widths) {
      const piped = crop ? source.clone().extract(crop) : source.clone();
      const { data, info } = await piped
        .resize({ width: Math.min(width, crop?.width ?? full ?? width), kernel: "lanczos3", withoutEnlargement: true })
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
