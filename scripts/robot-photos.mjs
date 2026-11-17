// Prepares the two competition photos behind the home page (src/components/home-scene.tsx).
//
//   npm run robot-photos
//
// The home page shows the competition itself, field elements and several teams' robots, not one
// team (owner's decision, Nov 16, 2026; the photos are the owner's to use). The originals sit in
// public/ and are used whole, as shot: no cutout, no blur, never mirrored.
// - home-rebuilt-tower.jpg (3:2, 3,000 px): the hero. FRC 2026 REBUILT: the blue alliance tower
//   (x 46-66%, y 14-68%) with an arc of yellow balls flying over it (x 33-58%, its peak at y 16%),
//   balls across the grey carpet, the packed stands on the right (x 60-100%) and the red alliance
//   side on the left. The 1,497 px original was enlarged 4x with Real-ESRGAN x4plus (Qualcomm AI
//   Hub's ONNX release, run locally in blended 128 px tiles), mixed 80/20 with a plain Lanczos
//   enlargement to keep the carpet's grain, and brought to 3,000 px; then made team-neutral by hand
//   (Nov 16, 2026): the "4744" bumper digits, the scoreboards and banner numbers and the sponsor
//   logos filled from their surroundings, the stands, referees and spectators blurred and darkened
//   so no face reads, the drivers' yellow shirts softened and the reds cooled. That master is what
//   ships; this script only grades, masks and resizes it.
// - home-reef-lane.jpg (4:3, 2,000 px): the lane beside the vendor cards on a desktop. FIRST
//   Championship 2025 (Reefscape): the reef, its purple coral branches holding white coral and teal
//   algae, the stands behind, and robot 1690 right of it (x 49-79%). The page shows the photo's
//   left 69% (globals.css), so the reef and about half the robot (its chassis, upper arm and
//   elevator) share the lane, the robot at the window's edge;
//   only its left edge is faded here; its top and bottom fade in CSS (a straight line under the first
//   vendor row, and a feather at the lane's bottom).
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
// The desktop hero is drawn at most ~1,300 CSS px wide (globals.css, .scene-hero), so the
// 2,600 px copy covers a 2x screen; the lane's 2,000 px original is shown smaller than that.
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
const NIGHT = [2 / 255, 4 / 255, 22 / 255]; // --orbit-night
const BLUE = [0, 20 / 255, 190 / 255]; // --orbit-blue
const ICE = [238 / 255, 242 / 255, 255 / 255]; // the day sky behind the photos (globals.css, .scene-canvas in light)

/**
 * The day version of a look: the same mask and shade shapes (so the same crop and soft edges), a
 * brighter grade, the tint and the ultramarine soft-light lighter, and the shade an ice-white wash
 * (`shade` scales it: the Reefscape stands keep most of their colour, so the lane isn't a white glare).
 */
const daylight = (look, { brightness, contrast, saturate, tint = 0.85, grade = 0.1, shade = 1, lift }) => ({
  ...look,
  filter: { brightness, contrast, saturate },
  tint: look.tint && ((x, y) => tint * look.tint(x, y)),
  shade: lift ? (x, y) => Math.max(shade * look.shade(x, y), lift(x, y)) : (x, y) => shade * look.shade(x, y),
  shadeTo: ICE,
  // `lift` (a dark arena by day): the ice wash falls mostly on the dark pixels, so the dark ceiling
  // and stands lift to pearl while the lit field and the yellow balls keep their colour.
  shadeDark: Boolean(lift),
  grade,
});

/**
 * The look, as the CSS had it (globals.css, "The home page as one competition photograph"):
 * - filter: brightness, contrast, saturate, in that order, each clamped (sRGB, as Chromium does);
 * - tint (hero only): rgb(0 20 190) in `mix-blend-mode: color`, by frame position, sparing the
 *   yellow balls if `spareYellow` (pixels that are clearly yellow keep their colour);
 * - shade: midnight overlays;
 * - grade: --orbit-blue in `soft-light` at 22%;
 * - mask: the frame's soft edges, as alpha.
 * The shade, tint and mask sit on the frame, which holds the photo scaled by `scale` about its
 * centre (the lane photo is drawn at 106%), so they're read at the frame point each pixel lands on.
 * `daylight()` turns a look into its light-theme copy.
 */
const NIGHT_LOOKS = {
  "home-rebuilt-tower": (desktop) => ({
    scale: 1,
    spareYellow: true,
    filter: { brightness: 0.86, contrast: 1.06, saturate: 1.04 },
    // Ultramarine over the stands (their red shirts) and, lighter, over the red alliance side.
    tint: (x, y) => {
      const stands = ramp([[0.58, 0], [0.68, 0.7]])(x) * ramp([[0.5, 1], [0.6, 0]])(y);
      const red = ramp([[0.3, 0.45], [0.42, 0]])(x) * ramp([[0.3, 0], [0.4, 1], [0.62, 1], [0.7, 0]])(y);
      const ceiling = ramp([[0, 0.5], [0.1, 0.25], [0.14, 0]])(y);
      return Math.max(stands, red, ceiling);
    },
    shade: (x, y) => {
      // Midnight over the arena's ceiling and the empty carpet at the bottom.
      const top = ramp([[0, 0.7], [0.08, 0.4], [0.14, 0.08], [0.2, 0]])(y);
      const floor = ramp([[0.72, 0], [0.86, 0.35], [1, 0.7]])(y);
      const down = 1 - (1 - top) * (1 - floor);
      // The stands, dimmer toward the right.
      const stands = ramp([[0.62, 0], [0.74, 0.3], [1, 0.55]])(x);
      const both = 1 - (1 - down) * (1 - stands);
      if (!desktop) return both;
      // On a desktop the stands run under the headline: a little darker, never a wall (the
      // readability wash behind the words is in CSS, .scene-hero-lane::before).
      const side = ramp([[0.7, 0], [0.86, 0.22], [1, 0.4]])(x);
      return 1 - (1 - both) * (1 - side);
    },
    mask: desktop
      ? (() => {
          // A desktop: the photo runs about 70% of the window, so its right side fades gradually,
          // from the stands' edge to nothing, softly under the subtitle and the telemetry. The
          // bottom fade is gentle here: CSS (.scene-photo-short) feathers it out above the vendors.
          const fadeY = ramp([[0, 0], [0.07, 1], [0.8, 1], [0.99, 0]]);
          const fadeX = ramp([[0, 0], [0.1, 1], [0.56, 1], [0.72, 0.72], [0.86, 0.32], [1, 0]]);
          const field = ellipse(0.78, 0.74, 0.46, 0.42, [[0.62, 1], [1, 0]]);
          return (x, y) => fadeY(y) * fadeX(x) * field(x, y);
        })()
      : (() => {
          // Phones and tablets: a wide, soft feather all round; the tower and the whole arc stay solid.
          const fadeY = ramp([[0, 0], [0.09, 1], [0.74, 1], [0.93, 0]]);
          const fadeX = ramp([[0, 0], [0.12, 1], [0.8, 1], [1, 0]]);
          const field = ellipse(0.64, 0.6, 0.5, 0.46, [[0.56, 1], [1, 0]]);
          return (x, y) => fadeY(y) * fadeX(x) * field(x, y);
        })(),
  }),
  "home-reef-lane": () => ({
    scale: 1.06,
    filter: { brightness: 0.92, contrast: 1.05, saturate: 1 },
    tint: null,
    shade: (() => {
      // The stands behind the reef, darker toward the top; the reef and robot 1690 (its elevator,
      // upper arm and chassis, x 49-79%) stay bright.
      const stands = ramp([[0, 0.75], [0.2, 0.5], [0.5, 0.3], [0.75, 0.12], [0.84, 0]]);
      const reef = ellipse(0.26, 0.4, 0.27, 0.62, [[0.5, 1], [1, 0]]);
      const robot = ellipse(0.17, 0.34, 0.65, 0.64, [[0.6, 1], [1, 0]]);
      return (x, y) => stands(y) * (1 - Math.max(reef(x, y), robot(x, y)));
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
   * The FTC lane (home-ftc-lane.webp, 665 x 998, portrait, padded to 965 x 1088 by `prepFtc`; the
   * original is x 0.31-1, y 0.083-1 of that): INTO THE DEEP 2025, a robot at the high basket with its
   * tall silver slide and coiled cable, a referee and spectators behind. `prepFtc` has recoloured it
   * and blurred the people, so the look only grades and fades it. On a desktop it runs to the
   * window's left edge (the mirrored pad, shaded down to the canvas there, so it ends seamlessly at
   * any width) and feathers out at the top, at its right under the group cards and at the bottom.
   */
  "home-ftc-lane": (desktop) => {
    // The basket and its samples, kept warm (bake's `spare`).
    const basket = desktop ? ellipse(0.11, 0.07, 0.48, 0.17, [[0.7, 1], [1, 0]]) : () => 0;
    return {
      scale: 1,
      filter: { brightness: 0.86, contrast: 1.06, saturate: 1 },
      spare: basket,
      // The blurred stands toward the canvas's ultramarine.
      tint: ((down) => (x, y) => down(y))(desktop ? ramp([[0, 0.5], [0.36, 0.3], [0.64, 0]]) : ramp([[0, 0.3], [0.5, 0]])),
      shade: desktop
        ? (x, y) => {
            const topS = ramp([[0, 0.6], [0.09, 0.4], [0.2, 0.15], [0.36, 0]])(y);
            const floor = ramp([[0.87, 0], [1, 0.5]])(y);
            // The mirrored pad, down to the canvas toward the window's edge.
            const pad = ramp([[0, 0.92], [0.12, 0.72], [0.26, 0.4], [0.36, 0.12], [0.44, 0]])(x);
            return 1 - (1 - topS) * (1 - floor) * (1 - pad);
          }
        : () => 0.08,
      mask: desktop
        ? (() => {
            const fadeY = ramp([[0, 0], [0.075, 1], [0.87, 1], [0.99, 0]]);
            // No fade on the left: it meets the window's edge. Its far end only, for the widest windows.
            const fadeX = ramp([[0, 0], [0.04, 1], [0.72, 1], [0.86, 0.5], [0.985, 0]]);
            // The lower right corner, under the last card, rounds off.
            const round = ramp([[0.8, 1], [1.1, 0]]);
            const corner = (x, y) => round(Math.hypot(Math.max(0, x - 0.38) / 0.62, Math.max(0, y - 0.66) / 0.36));
            return (x, y) => fadeY(y) * fadeX(x) * corner(x, y);
          })()
        : (() => {
            // The phone strip (the robot, cropped): soft on every side.
            const fadeY = ramp([[0, 0], [0.22, 1], [0.78, 1], [1, 0]]);
            const fadeX = ramp([[0, 0], [0.16, 1], [0.84, 1], [1, 0]]);
            return (x, y) => fadeY(y) * fadeX(x);
          })(),
    };
  },
};
const LOOKS = {
  night: NIGHT_LOOKS,
  day: {
    "home-rebuilt-tower": (desktop) =>
      daylight(NIGHT_LOOKS["home-rebuilt-tower"](desktop), {
        brightness: 1.06,
        contrast: 1.02,
        saturate: 1.04,
        lift: (x, y) => {
          const ceiling = ramp([[0, 0.92], [0.2, 0.72], [0.4, 0.4], [0.56, 0]])(y);
          const stands = ramp([[0.6, 0], [0.72, 0.6], [1, 0.9]])(x) * ramp([[0.5, 1], [0.62, 0]])(y);
          const floor = ramp([[0.74, 0], [0.9, 0.6], [1, 0.85]])(y);
          return Math.max(ceiling, stands, floor);
        },
      }),
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
        // The yellow balls keep their colour (`spareYellow`), and warm pixels inside `spare`'s region
        // (the FTC basket's samples).
        let yellow = look.spareYellow ? clamp((Math.min(c[0], c[1]) - c[2] - 0.18) / 0.2) : 0;
        if (look.spare) yellow = Math.max(yellow, look.spare(fx, fy) * clamp((c[0] - c[2] - 0.08) / 0.18));
        const a = look.tint(fx, fy) * (1 - yellow);
        if (a > 0) {
          const m = colorBlend(c, BLUE);
          c = c.map((v, k) => (1 - a) * v + a * m[k]);
        }
      }
      let sh = look.shade(fx, fy);
      if (look.spare) sh *= 1 - 0.7 * look.spare(fx, fy);
      if (look.shadeDark) sh *= 1 - 0.8 * lum(...c);
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
 * The FTC photo before its look (source 665 x 998). It is first padded, by mirroring, 300 px on the
 * left and 90 px on top (FTC_PAD), so on a desktop the lane can run to the window's left edge and the
 * basket has room above it; the pad lies outside `sharp`, so it comes out blurred like the rest of
 * the background, and the look shades it to the canvas. Drawn regions, in source pixels, rather than
 * hue alone (hue alone would catch skin, the brown trousers and the orange-yellow samples):
 * - sharp: the basket, its pole, the lower bin, the claw, cable and slide, and the robot and field
 *   below the wall's rail. Everything else (the referee and spectators) is blurred, darkened and
 *   flattened, so no face is recognisable and the referee's stripes go quiet.
 * - red: the red basket pole and the floor tape turn brand blue: their red pixels only (never the
 *   orange samples in the basket), the hue swapped and the value kept, so the pole keeps its
 *   highlights and shadows.
 * - plate: the number plate's digits are gone; it becomes dark smoked metal like the chassis around
 *   it, lit a little at its top edge and shadowed below, with a fine brushed grain. The LED strip
 *   under it stays as shot.
 * The yellow samples, green claw tips and yellow wheels sit outside `red` and keep their colours;
 * the look spares the samples from its ultramarine (`spare`).
 */
const FTC_PAD = { left: 300, top: 90 };
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
    [[0, 660], [160, 616], [665, 590], [665, 612], [630, 616], [630, 806], [665, 810], [665, 998], [0, 998]],
  ],
  red: [
    [[98, 20], [152, 20], [152, 664], [114, 664]],
    [[196, 862], [256, 862], [256, 900], [196, 900]],
  ],
  plate: [[[282, 737], [392, 737], [392, 798], [282, 798]]],
};
/** Brand blue's hue (#0014BE, 234 degrees) as a hue swap: how much of the chroma goes to green. */
const BLUE_HUE_G = (240 - 234) / 60;

async function prepFtc(rgb0, w0, h0, theme) {
  const { left, top } = FTC_PAD;
  const w = w0 + left;
  const h = h0 + top;
  const rgb = await sharp(rgb0, { raw: { width: w0, height: h0, channels: 3 } })
    .extend({ left, top, extendWith: "mirror" })
    .raw()
    .toBuffer();
  const shift = (polys) => polys.map((poly) => poly.map(([x, y]) => [x + left, y + top]));
  const [sharpM, redM, plateM, back] = await Promise.all([
    polygonMask(w, h, shift(FTC.sharp), 2.2),
    polygonMask(w, h, shift(FTC.red), 1.2),
    polygonMask(w, h, shift(FTC.plate), 1.2),
    blurred(rgb, w, h, 9),
  ]);
  const [px0, py0] = [FTC.plate[0][0][0] + left, FTC.plate[0][0][1] + top];
  const [px1, py1] = [FTC.plate[0][2][0] + left, FTC.plate[0][2][1] + top];
  const out = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const i = p * 3;
    let c = [rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255];
    const r = redM[p] / 255;
    if (r > 0) {
      const [R, G, B] = c;
      // Red, not orange: the samples behind the basket's plastic keep their colour.
      const a = r * clamp((R - Math.max(G, B) * 1.25) / 0.25) * clamp((0.62 - G / Math.max(R, 1e-3)) / 0.2);
      if (a > 0) {
        // The same value (the brightest channel) and 80% of the chroma, at brand blue's hue.
        const v = R;
        const ch = 0.8 * (R - Math.min(G, B));
        const blue = [v - ch, v - ch + BLUE_HUE_G * ch, v];
        // A touch brighter, so a dark blue keeps about the red's lightness.
        const lift = 1 + 0.25 * (1 - v);
        c = c.map((x, k) => (1 - a) * x + a * clamp(blue[k] * lift));
      }
    }
    const pl = plateM[p] / 255;
    if (pl > 0) {
      const x = p % w;
      const y = Math.floor(p / w);
      const u = (x - px0) / (px1 - px0);
      const t = (y - py0) / (py1 - py0);
      // Smoked metal: dark like the chassis, a lit top edge, shadowed toward the bottom and the
      // sides, and a fine horizontal grain (fixed, so every run bakes the same plate).
      const grain = 0.012 * Math.sin(y * 2.7 + Math.sin(x * 0.37) * 0.8) + 0.008 * Math.sin(x * 0.11 + y * 0.9);
      const edge = Math.min(u, 1 - u, t, 1 - t);
      const bevel = edge < 0.035 ? -0.025 : 0;
      const l = clamp(0.085 + 0.05 * clamp(1 - t * 2.2) - 0.03 * t + 0.015 * Math.sin(Math.PI * u) + grain + bevel);
      const metal = [l * 0.96, l * 0.98, l * 1.08];
      c = c.map((v, k) => (1 - pl) * v + pl * metal[k]);
    }
    // Sharp eases in over the original's first 160 px, so the wall meets the blurred pad without a seam.
    const s = (sharpM[p] / 255) * clamp((p % w - left) / 160) ** 0.8;
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
  return { data: out, width: w, height: h };
}

/** Each set of copies: its file-name suffix, its widths, whether it takes the desktop look, and a crop. */
const PHOTOS = {
  "home-rebuilt-tower": {
    outputs: [
      // Phones and tablets: never more than 1,400 px.
      { suffix: "-phone", widths: [800, 1400], desktop: false },
      { suffix: "", widths: [1000, 1500, 2000, 2600], desktop: true },
    ],
    quality: { avif: 62, webp: 84 },
  },
  // Shown from 1024px only.
  "home-reef-lane": { outputs: [{ suffix: "", widths: [1000, 1500, 2000], desktop: true }] },
  // 665 px is all there is, 965 once padded (FTC_PAD); the page draws the padded photo at most
  // ~780 CSS px wide, the original part of it ~540. No AI upscaler was at hand, so it isn't
  // enlarged. The phone strip is the robot, cropped (in padded pixels).
  "home-ftc-lane": {
    file: "public/home-ftc-lane.webp",
    prep: prepFtc,
    outputs: [
      { suffix: "", widths: [640, 965], desktop: true },
      { suffix: "-phone", widths: [665], desktop: false, crop: { left: 300, top: 650, width: 665, height: 380 } },
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
  /** The photo before its look, per theme when it has a `prep` step (which may pad it), and its width. */
  const prepped = new Map();
  const sourceFor = async (theme) => {
    if (!prep) return { source: original, full: (await original.metadata()).width };
    if (!prepped.has(theme)) {
      const { data, info } = await original.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const done = await prep(data, info.width, info.height, theme);
      prepped.set(theme, { source: sharp(done.data, { raw: { width: done.width, height: done.height, channels: 3 } }), full: done.width });
    }
    return prepped.get(theme);
  };
  const out = `public/robots/${name}`;
  const q = quality ?? { avif: 55, webp: 78 };
  for (const [theme, { suffix, widths, desktop, crop }] of themes.flatMap((t) => outputs.map((o) => [t, o]))) {
    const look = LOOKS[theme][name](desktop);
    const { source, full } = await sourceFor(theme);
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
