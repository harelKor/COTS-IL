// Prepares the robot photos behind the home page (src/components/robot-backdrop.tsx).
//
//   npm run robot-photos -- 1690-whisper <robot close-up.jpg> <arena wide shot.webp>
//   npm run robot-photos -- 1690-crescendo <photo.webp>
//
// Each photo becomes one transparent image that melts into the page:
// - the robot (its outline as polygons, feathered) stays sharp, in its own colours;
// - everything else (arena, field elements, stands) becomes a soft blue-washed depth-of-field
//   texture: heavy blur, colour mostly drained, mixed toward the page's blues. The blur is far
//   past recognizing anyone, so no face in the stands or behind the fence can be made out;
// - that texture is thickest around the robot and thins to nothing toward the photo's edges, so
//   there is no rectangle anywhere (the right edge, against the window, stays);
// - writes public/robots/<name>-<width>.{avif,webp}.
// The sources stay out of the repo (they show crowds); only the processed files are kept.
// A "composite" photo takes the sharp robot from a close-up and lays it over a wider arena shot
// of the same moment, scaled to match, so the robot is crisp at a large size.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

/** Polygons [x, y, x, y, ...] around 1690 WHISPER's parts, in the close-up's pixels. */
const WHISPER = [
  [905, 345, 1060, 345, 1060, 620, 905, 620], // elevator carriage
  [910, 620, 948, 620, 948, 1000, 910, 1000], // elevator rails (the gap shows the stands: kept soft)
  [1020, 620, 1060, 620, 1060, 1000, 1020, 1000],
  [850, 950, 1125, 950, 1125, 995, 850, 995], // LED plate
  [885, 995, 1100, 995, 1100, 1580, 885, 1580], // lower elevator
  [865, 995, 905, 995, 760, 1640, 715, 1640], // tripod legs
  [1075, 995, 1115, 995, 1300, 1700, 1255, 1700],
  [585, 1620, 700, 1605, 1335, 1600, 1290, 1540, 1560, 1560, 1565, 1790, 1430, 1800, 1425, 1880, 630, 1890, 535, 1825, 515, 1700, 585, 1690], // bumpers, frame, belly pan
  [1270, 1540, 1400, 1480, 1500, 1540, 1550, 1640, 1555, 1760, 1430, 1800], // intake (rounded, clear of the ball)
];

const PHOTOS = {
  // 2025 Reefscape: the tall elevator robot, blue bumpers. The arena from the wide shot (x 900 to
  // 1700, from y 380), scaled 1.776x to the close-up, whose elevator top (905, 345) sits at (1215, 565) in it.
  "1690-whisper": {
    sources: 2,
    arena: { crop: { left: 900, top: 380, width: 800, height: 1122 }, scale: 1.776 },
    robotAt: { x: 1215, y: 565, from: { x: 905, y: 345 } },
    robot: WHISPER,
    fade: { left: 0.4, right: 0, top: 0.14, bottom: 0.22 },
    base: 0.32,
    widths: [720, 1080, 1420],
  },
  // 2024 Crescendo: the compact robot, red bumpers, on grey carpet. Cropped below the people
  // behind the fence; the rest is blurred anyway.
  "1690-crescendo": {
    sources: 1,
    crop: { left: 300, top: 400, width: 800, height: 598 },
    robot: [[515, 740, 545, 725, 590, 700, 600, 670, 690, 622, 755, 628, 765, 690, 800, 730, 858, 780, 855, 845, 600, 852, 515, 800]],
    fade: { left: 0, right: 0.35, top: 0.3, bottom: 0.3 },
    base: 0.22,
    widths: [480, 800],
  },
};

const [name, ...srcs] = process.argv.slice(2);
const spec = PHOTOS[name];
if (!spec || srcs.length !== spec.sources) {
  console.error("usage: node scripts/robot-photos.mjs 1690-whisper <close-up> <arena> | 1690-crescendo <photo>");
  process.exit(1);
}

/** A light royal blue: the texture is mixed toward it, so the arena reads blue-washed. */
const WASH = [188, 206, 246];

let W, H, sharpRgb, arenaRgb, mask;

async function polygonMask(polys) {
  const shapes = polys.map((pts) => `<polygon points="${pts.join(" ")}"/>`).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%"/><g fill="#fff">${shapes}</g></svg>`))
    .blur(11)
    .extractChannel(0)
    .raw()
    .toBuffer();
}

if (spec.sources === 2) {
  const { crop, scale } = spec.arena;
  W = Math.round(crop.width * scale);
  H = Math.round(crop.height * scale);
  arenaRgb = await sharp(srcs[1]).rotate().extract(crop).resize(W, H).blur(20).modulate({ saturation: 0.35 }).removeAlpha().raw().toBuffer();
  // Where the close-up's (0, 0) lands on this canvas.
  const dx = Math.round((spec.robotAt.x - crop.left) * scale - spec.robotAt.from.x);
  const dy = Math.round((spec.robotAt.y - crop.top) * scale - spec.robotAt.from.y);
  const close = sharp(srcs[0]).rotate();
  const meta = await close.metadata();
  const left = Math.max(0, -dx);
  const top = Math.max(0, -dy);
  const width = Math.min(meta.width - left, W - Math.max(0, dx));
  const height = Math.min(meta.height - top, H - Math.max(0, dy));
  const piece = await close.clone().extract({ left, top, width, height }).modulate({ saturation: 0.95, brightness: 1.04 }).png().toBuffer();
  sharpRgb = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: piece, left: Math.max(0, dx), top: Math.max(0, dy) }])
    .removeAlpha()
    .raw()
    .toBuffer();
  mask = await polygonMask(spec.robot.map((pts) => pts.map((v, i) => v + (i % 2 ? dy : dx))));
} else {
  const { crop } = spec;
  W = crop.width;
  H = crop.height;
  const base = sharp(srcs[0]).rotate().extract(crop);
  sharpRgb = await base.clone().modulate({ saturation: 0.95, brightness: 1.04 }).removeAlpha().raw().toBuffer();
  arenaRgb = await base.clone().blur(12).modulate({ saturation: 0.35 }).removeAlpha().raw().toBuffer();
  mask = await polygonMask(spec.robot.map((pts) => pts.map((v, i) => v - (i % 2 ? crop.top : crop.left))));
}

// The texture's own transparency: thick around the robot, thinning toward the edges.
const glow = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).blur(Math.round(W / 9)).raw().toBuffer();
const ramp = (v, size, part) => (part <= 0 ? 1 : Math.max(0, Math.min(1, v / (size * part))));
const { fade } = spec;

const out = Buffer.alloc(W * H * 4);
for (let p = 0; p < W * H; p++) {
  const x = p % W;
  const y = (p - x) / W;
  const m = mask[p] / 255;
  const edges = ramp(x, W, fade.left) * ramp(W - 1 - x, W, fade.right) * ramp(y, H, fade.top) * ramp(H - 1 - y, H, fade.bottom);
  const around = Math.min(0.9, spec.base + (glow[p] / 255) * 2) * edges;
  let [r, g, b] = [0, 1, 2].map((k) => sharpRgb[p * 3 + k] * m + (arenaRgb[p * 3 + k] * 0.55 + WASH[k] * 0.45) * (1 - m));
  // The yellow field strap behind the elevator, greyed so it doesn't pull the eye.
  if (m > 0 && r > 140 && g > 130 && b < 110 && r - b > 70) r = g = b = (r + g + b) / 3;
  out[p * 4] = Math.round(r);
  out[p * 4 + 1] = Math.round(g);
  out[p * 4 + 2] = Math.round(b);
  out[p * 4 + 3] = Math.round(255 * (m + around * (1 - m)));
}

mkdirSync("public/robots", { recursive: true });
for (const width of spec.widths) {
  const img = sharp(out, { raw: { width: W, height: H, channels: 4 } }).resize({ width: Math.min(width, W) });
  await img.clone().avif({ quality: 52, effort: 6 }).toFile(`public/robots/${name}-${width}.avif`);
  await img.clone().webp({ quality: 70, alphaQuality: 95 }).toFile(`public/robots/${name}-${width}.webp`);
}
console.log(`public/robots/${name}-{${spec.widths.join(",")}}.{avif,webp}, ${W}x${H}`);
