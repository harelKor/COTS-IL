// Prepares the two 1690 Orbit competition photos behind the home page (src/components/home-scene.tsx).
//
//   npm run robot-photos
//
// The originals sit in public/ as orbit-1690-tall.jpg (2025 Reefscape, the tall elevator robot,
// 4:3) and orbit-1690-short.jpg (2024 Crescendo, red bumpers, 3:2). They're used whole: no
// cutout, no blur. This only writes smaller AVIF and WebP copies next to them for phones and
// laptops (public/robots/<name>-<width>.{avif,webp}); the page masks and tints them in CSS.
// Drop a sharper original in under the same name and run it again.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const PHOTOS = {
  "orbit-1690-tall": [960, 1600, 2000],
  "orbit-1690-short": [800, 1500],
};

mkdirSync("public/robots", { recursive: true });
for (const [name, widths] of Object.entries(PHOTOS)) {
  const src = `public/${name}.jpg`;
  const { width: full, height } = await sharp(src).metadata();
  for (const width of widths) {
    const img = sharp(src).rotate().resize({ width: Math.min(width, full), withoutEnlargement: true });
    await img.clone().avif({ quality: 55, effort: 6 }).toFile(`public/robots/${name}-${width}.avif`);
    await img.clone().webp({ quality: 78 }).toFile(`public/robots/${name}-${width}.webp`);
  }
  console.log(`public/robots/${name}-{${widths.join(",")}}.{avif,webp} from ${full}x${height}`);
}
