// Copies of the vendor logos in public/vendors for the dark home page, in public/vendors/on-dark.
// Every logo there is black or grey ink plus brand colour on a clear background (no opaque white
// anywhere), so only the neutral ink is turned white; brand colours keep their exact values (a CSS
// invert + hue-rotate would darken goBILDA's yellow and CTRE's green). Run `npm run vendor-logos`
// after replacing a logo in public/vendors.
import { readdirSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const SRC = "public/vendors";
const OUT = `${SRC}/on-dark`;
mkdirSync(OUT, { recursive: true });

for (const file of readdirSync(SRC).filter((f) => /\.(png|svg)$/.test(f))) {
  const name = file.replace(/\.\w+$/, "");
  const { data, info } = await sharp(`${SRC}/${file}`, { density: 200 })
    .resize({ height: 320, width: 1200, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (max && (max - min) / max >= 0.25) continue; // brand colour: unchanged
    const v = Math.round(255 - max * 0.35); // black → white, dark grey → near white
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  await sharp(data, { raw: info }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`${OUT}/${name}.png`);
  console.log(`${OUT}/${name}.png`, info.width, info.height);
}
