// Draws the app icons in public/ (web app manifest and Apple touch icon): the header's
// blue .btn-brand badge with the Lucide "boxes" mark. Run with `npm run icons`.
// sharp comes with Next.js, so nothing extra is installed.
import sharp from "sharp";

const PATHS = [
  "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",
  "m7 16.5-4.74-2.85",
  "m7 16.5 5-3",
  "M7 16.5v5.17",
  "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",
  "m17 16.5-5-3",
  "m17 16.5 4.74-2.85",
  "M17 16.5v5.17",
  "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",
  "M12 8 7.26 5.15",
  "m12 8 4.74-2.85",
  "M12 13.5V8",
];

/** `rounded`: corners drawn in (the "any" icons). Otherwise full bleed, for maskable and Apple icons, which the OS crops. */
function svg(size, { rounded, scale }) {
  const glyph = size * scale;
  const offset = (size - glyph) / 2;
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <g transform="translate(${offset} ${offset}) scale(${glyph / 24})" fill="none" stroke="#ffffff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
    ${PATHS.map((d) => `<path d="${d}"/>`).join("")}
  </g>
</svg>`;
}

const ICONS = [
  ["icon-192.png", 192, { rounded: true, scale: 0.6 }],
  ["icon-512.png", 512, { rounded: true, scale: 0.6 }],
  ["icon-maskable-512.png", 512, { rounded: false, scale: 0.5 }],
  ["apple-touch-icon.png", 180, { rounded: false, scale: 0.58 }],
];

await Promise.all(ICONS.map(([file, size, o]) => sharp(Buffer.from(svg(size, o))).png().toFile(`public/${file}`)));
console.log(`Wrote ${ICONS.map(([f]) => f).join(", ")} to public/`);
