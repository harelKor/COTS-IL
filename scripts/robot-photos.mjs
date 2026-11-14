// Prepares a robot photo for the home page backdrop (src/components/robot-backdrop.tsx).
//
//   node scripts/robot-photos.mjs <source.jpg> <name> [crop] [robot boxes]
//   npm run robot-photos -- ~/Pictures/whisper.jpg 1690-whisper
//
// What it does, so the photo sits in the page instead of on it:
// - crops to the robot (the CROPS entry below, or the whole photo);
// - keeps the robot sharp (its outline as polygons, feathered) and turns everything else into a soft,
//   pale blue haze: heavy blur, most of the colour drained, tinted toward the page blues. The
//   blur is strong enough that faces in the stands can't be recognized; the haze also turns
//   see-through away from the robot, so the photo has no edges and melts into the page;
// - keeps the robot's own colours, slightly calmer;
// - writes public/robots/<name>-{640,960}.{avif,webp}.
// The source photo stays out of the repo (it shows the crowd); only the processed files are kept.
// Then add the photo to ROBOT_PHOTOS in src/domain/robot-photos.ts.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

/** Per photo: the crop (in source pixels) and the robot's parts as boxes, in source pixels. */
const PHOTOS = {
  "1690-whisper": {
    crop: { left: 420, top: 300, width: 1120, height: 1660 },
    // Polygons [x, y, x, y, ...] around the robot's parts.
    robot: [
      [905, 345, 1060, 345, 1060, 620, 905, 620], // elevator carriage
      [910, 620, 948, 620, 948, 1000, 910, 1000], // elevator rails (the gap between them shows the stands: kept soft)
      [1020, 620, 1060, 620, 1060, 1000, 1020, 1000],
      [850, 950, 1125, 950, 1125, 995, 850, 995], // LED plate
      [885, 995, 1100, 995, 1100, 1580, 885, 1580], // lower elevator
      [865, 995, 905, 995, 760, 1640, 715, 1640], // tripod legs
      [1075, 995, 1115, 995, 1300, 1700, 1255, 1700],
      [585, 1620, 700, 1605, 1335, 1600, 1290, 1540, 1560, 1560, 1565, 1790, 1430, 1800, 1425, 1880, 630, 1890, 535, 1825, 515, 1700, 585, 1690], // bumpers, frame and belly pan
      [1270, 1540, 1420, 1470, 1545, 1600, 1560, 1790, 1430, 1800], // intake
    ],
  },
};

const [src, name] = process.argv.slice(2);
const spec = PHOTOS[name];
if (!src || !spec) {
  console.error(`usage: node scripts/robot-photos.mjs <source.jpg> <${Object.keys(PHOTOS).join("|")}>`);
  process.exit(1);
}
const { crop, robot } = spec;
const W = crop.width;
const H = crop.height;

const base = sharp(src).rotate().extract(crop);
// The robot keeps its colours (the blue bumper), a little calmer and brighter.
const sharpLayer = await base.clone().modulate({ saturation: 0.9, brightness: 1.06 }).removeAlpha().raw().toBuffer();
// The haze: blurred far past recognizing anyone, nearly greyed, then mixed half-way into the page's ice blue.
const blurred = await base.clone().blur(22).modulate({ saturation: 0.15 }).removeAlpha().raw().toBuffer();
const ICE = [226, 236, 255];
const haze = Buffer.from(blurred.map((v, i) => Math.round(v * 0.45 + ICE[i % 3] * 0.55)));

// The robot mask: its boxes, white on black, feathered so the edge doesn't show.
const boxes = robot
  .map((pts) => `<polygon points="${pts.map((v, i) => (i % 2 ? v - crop.top : v - crop.left)).join(" ")}"/>`)
  .join("");
const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%"/><g fill="#fff">${boxes}</g></svg>`))
  .blur(7)
  .greyscale()
  .raw()
  .toBuffer();

// The haze's own transparency: thick right around the robot, thinning to nothing further out
// and at the photo's edges, so there is no box edge anywhere (a very wide blur of the robot mask).
const glow = await sharp(mask, { raw: { width: W, height: H, channels: mask.length / (W * H) } })
  .extractChannel(0)
  .blur(110)
  .raw()
  .toBuffer();
const edge = (v, size) => Math.min(1, v / (size * 0.1), (size - 1 - v) / (size * 0.1));

const out = Buffer.alloc(W * H * 4);
const stride = mask.length / (W * H);
for (let p = 0; p < W * H; p++) {
  const x = p % W;
  const y = (p - x) / W;
  const m = mask[p * stride] / 255;
  const around = Math.min(1, (glow[p] / 255) * 2.4) * 0.8 * Math.max(0, edge(x, W)) * Math.max(0, edge(y, H));
  let [r, g, b] = [0, 1, 2].map((k) => sharpLayer[p * 3 + k] * m + haze[p * 3 + k] * (1 - m));
  // The yellow field strap behind the robot, greyed so it doesn't pull the eye.
  if (r > 140 && g > 130 && b < 110 && r - b > 70) r = g = b = (r + g + b) / 3;
  out[p * 4] = Math.round(r);
  out[p * 4 + 1] = Math.round(g);
  out[p * 4 + 2] = Math.round(b);
  out[p * 4 + 3] = Math.round(255 * (m + around * (1 - m)));
}

mkdirSync("public/robots", { recursive: true });
for (const width of [640, 960]) {
  const img = sharp(out, { raw: { width: W, height: H, channels: 4 } }).resize({ width });
  await img.clone().avif({ quality: 55, effort: 6 }).toFile(`public/robots/${name}-${width}.avif`);
  await img.clone().webp({ quality: 72 }).toFile(`public/robots/${name}-${width}.webp`);
}
console.log(`public/robots/${name}-{640,960}.{avif,webp}, ${W}x${H} crop`);
