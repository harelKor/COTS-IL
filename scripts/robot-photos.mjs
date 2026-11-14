// Prepares a robot photo for the home page backdrop (src/components/robot-backdrop.tsx).
//
//   node scripts/robot-photos.mjs <source.jpg> <name> [crop] [robot boxes]
//   npm run robot-photos -- ~/Pictures/whisper.jpg 1690-whisper
//
// What it does, so the photo sits in the page instead of on it:
// - crops to the robot (the CROPS entry below, or the whole photo);
// - keeps the robot sharp (its outline as polygons, feathered) and turns everything else into a soft,
//   pale blue haze: heavy blur, most of the colour drained, tinted toward the page blues. The
//   blur is strong enough that faces in the stands can't be recognized;
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
      [500, 1600, 590, 1560, 1445, 1560, 1445, 1910, 500, 1910], // bumpers and belly pan
      [1270, 1470, 1420, 1440, 1545, 1600, 1545, 1860, 1270, 1860], // intake
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

const ch = 3;
const out = Buffer.alloc(W * H * ch);
for (let i = 0, p = 0; p < W * H; p++, i += ch) {
  const m = mask[p * (mask.length / (W * H))] / 255;
  for (let k = 0; k < ch; k++) out[i + k] = Math.round(sharpLayer[i + k] * m + haze[i + k] * (1 - m));
}

mkdirSync("public/robots", { recursive: true });
for (const width of [640, 960]) {
  const img = sharp(out, { raw: { width: W, height: H, channels: ch } }).resize({ width });
  await img.clone().avif({ quality: 55, effort: 6 }).toFile(`public/robots/${name}-${width}.avif`);
  await img.clone().webp({ quality: 72 }).toFile(`public/robots/${name}-${width}.webp`);
}
console.log(`public/robots/${name}-{640,960}.{avif,webp}, ${W}x${H} crop`);
