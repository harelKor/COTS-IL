// Prepares the two 1690 Orbit competition photos behind the home page (src/components/home-scene.tsx).
//
//   npm run robot-photos
//
// The originals sit in public/ as orbit-1690-tall.jpg (2025 Reefscape, the tall elevator robot,
// 4:3) and orbit-1690-short.jpg (2024 Crescendo, red bumpers, 3:2). They're used whole: no
// cutout, no blur. The page shows them mirrored, so both robots face in toward the middle; a
// plain mirror would print "1690" backwards on the bumpers. So this mirrors each photo and then
// flips every lettered patch (the bumper numbers, the Reefscape robot's sponsor plate) back
// along its own baseline, so the text reads the right way while staying on the bumper's slope.
// It writes public/robots/<name>-facing.jpg and smaller AVIF and WebP copies
// (public/robots/<name>-facing-<width>.{avif,webp}); the page masks and tints them in CSS.
// Drop a sharper original in under the same name, adjust PATCHES to it, and run it again.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

/**
 * Lettered patches, in the ORIGINAL photo's pixels: the centre, the slope of the text's baseline
 * (letters stay upright in the photo, so a receding side keeps its slope), how far the text reaches
 * left and right and up and down from the centre, and a soft edge, all in pixels.
 */
const PHOTOS = {
  "orbit-1690-tall": {
    widths: [960, 1600, 2000],
    patches: [
      // The sponsor plate and the front bumper's "1690".
      { c: [1274, 1361], slope: 0, half: [182, 78], soft: 12 },
      // "1690" on the bumper's left side, receding.
      { c: [1022, 1382], slope: 0.6, half: [17, 23], soft: 2.5 },
    ],
  },
  "orbit-1690-short": {
    widths: [800, 1500],
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

mkdirSync("public/robots", { recursive: true });
for (const [name, { widths, patches }] of Object.entries(PHOTOS)) {
  const { data, info } = await sharp(`public/${name}.jpg`).rotate().flop().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const p of patches) unmirrorPatch(data, info.width, info.height, p);
  const raw = { raw: { width: info.width, height: info.height, channels: 3 } };
  await sharp(data, raw).jpeg({ quality: 86, mozjpeg: true }).toFile(`public/robots/${name}-facing.jpg`);
  for (const width of widths) {
    const img = sharp(data, raw).resize({ width: Math.min(width, info.width), withoutEnlargement: true });
    await img.clone().avif({ quality: 55, effort: 6 }).toFile(`public/robots/${name}-facing-${width}.avif`);
    await img.clone().webp({ quality: 78 }).toFile(`public/robots/${name}-facing-${width}.webp`);
  }
  console.log(`public/robots/${name}-facing{.jpg,-{${widths.join(",")}}.{avif,webp}} from ${info.width}x${info.height}`);
}
