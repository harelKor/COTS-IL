/**
 * The product page's photos: which ones to show, in what order, and which one follows the
 * choice. Pure, so the rules have tests; `src/lib/image-size.ts` reads the sizes on the server.
 */

/** Shopify adds `_<uuid>` to a re-uploaded file's name; WCP uploads one photo once per variant. */
const UPLOAD_ID = /_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.[a-z0-9]+$|$)/i;

/** A photo's file name without its query, Shopify's `_<uuid>` or case: `15mmBelt_e4aa….png?v=1` → `15mmbelt.png`. */
export function photoKey(url: string): string {
  const path = url.split(/[?#]/)[0];
  const name = decodeURIComponent(path.slice(path.lastIndexOf("/") + 1));
  return name.replace(UPLOAD_ID, "").toLowerCase();
}

/** The photos in order, once per file name (the first copy kept). */
export function dedupePhotos(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    const key = photoKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type PhotoSize = { width: number; height: number };

/** Under this many pixels on its long side a main photo looks soft at 2x; at or over LARGE it's sharp. */
export const SMALL_PHOTO = 1000;
export const LARGE_PHOTO = 1200;

/**
 * When the first photo is small and a large one exists, the first large one moves to the front
 * (the Kraken's first photo is 650px, the rest 2048px). Unknown sizes count as neither.
 */
export function largeFirst(urls: readonly string[], sizes: readonly (PhotoSize | null)[]): string[] {
  const long = (i: number) => (sizes[i] ? Math.max(sizes[i]!.width, sizes[i]!.height) : null);
  const first = long(0);
  if (first === null || first >= SMALL_PHOTO) return [...urls];
  const large = urls.findIndex((_, i) => (long(i) ?? 0) >= LARGE_PHOTO);
  if (large < 0) return [...urls];
  return [urls[large], ...urls.filter((_, i) => i !== large)];
}

/**
 * Width and height from the first bytes of a PNG, JPEG, GIF or WebP file, or null. Enough for the
 * header: a PNG or WebP needs 30 bytes, a JPEG up to its first frame marker.
 */
export function imageSize(bytes: Uint8Array): PhotoSize | null {
  const b = bytes;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  const size = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null);

  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === "PNG") return size(u32be(16), u32be(20));
  if (b.length >= 10 && ascii(0, 3) === "GIF") return size(u16le(6), u16le(8));
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") return size(u24le(24) + 1, u24le(27) + 1);
    if (chunk === "VP8 ") return size(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return size((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      // Fill bytes and markers without a length.
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      // Start of frame: every SOFn except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return size(u16be(i + 7), u16be(i + 5));
      }
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  return null;
}

/** Colour words as suppliers spell them in file names, SKUs and option values, each to one colour. */
const COLOURS: Record<string, string> = {
  green: "green",
  orange: "orange",
  blue: "blue",
  black: "black",
  blk: "black",
  gray: "gray",
  grey: "gray",
  red: "red",
  yellow: "yellow",
  purple: "purple",
  white: "white",
};

/** The colours named in a text, by whole word (`red` is not in `shredder`). */
export function coloursIn(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .flatMap((word) => (COLOURS[word] ? [COLOURS[word]] : [])),
  );
}

type PhotoVariant = { sku: string | null; supplierCode: string; image: string | null; options: Record<string, string> };

/**
 * A variant's photo is its own when it tells it apart from the same vendor's other variants (the
 * timing belt's 9mm and 15mm photos). When every variant from a vendor shares the product's photo
 * (Stealth, or the Kraken's one variant per vendor), it says nothing about the choice: null.
 */
export function ownPhoto(variant: PhotoVariant, variants: readonly PhotoVariant[]): string | null {
  if (!variant.image) return null;
  const keys = new Set(variants.filter((v) => v.supplierCode === variant.supplierCode).map((v) => (v.image ? photoKey(v.image) : "")));
  return keys.size > 1 ? variant.image : null;
}

/** The SKU before a colour suffix: `am-3155_green` → `am-3155`. */
function skuBase(sku: string): string {
  return sku.toLowerCase().split("_")[0];
}

/**
 * The gallery photo that shows the current choice, or null to leave the photo as it is:
 * 1. the chosen variant's own photo (`ownPhoto`), matched by file name;
 * 2. a photo named after the chosen SKU (`am-3155_green…` for am-3155_green);
 * 3. with a partial choice, the one gallery photo that the remaining variants' own photos name
 *    (every 9mm belt in the gallery is `9mmBelts.png`);
 * 4. the one colour the choice names: in the picked option values, or else shared by the SKUs of
 *    every variant still in the running (Stealth's durometer chips say "35A", its SKUs `_green`).
 *    The photo is the one file name with that colour, or the one of those that also names the
 *    SKU before its suffix (`am-3155_blue` over `am-3156_blue` for a 2 inch wheel).
 *
 * `candidates` are the variants that fit the choice so far; `chosen` is the settled one, if any.
 */
export function followPhoto(
  gallery: readonly string[],
  candidates: readonly PhotoVariant[],
  chosen: PhotoVariant | null,
  variants: readonly PhotoVariant[],
  selected: Record<string, string>,
): string | null {
  const byKey = new Map(gallery.map((url) => [photoKey(url), url]));
  const stem = (url: string) => photoKey(url).replace(/\.[a-z0-9]+$/, "");

  // One variant per vendor (the Kraken): nothing to choose, so the photo stays the family's best.
  if (chosen && variants.filter((v) => v.supplierCode === chosen.supplierCode).length < 2) return null;
  if (chosen) {
    const own = ownPhoto(chosen, variants);
    if (own && byKey.has(photoKey(own))) return byKey.get(photoKey(own))!;
    const sku = chosen.sku?.toLowerCase();
    if (sku) {
      const named = gallery.find((url) => stem(url) === sku);
      if (named) return named;
    }
  }

  // Nothing picked yet: the photo stays the family's.
  if (Object.keys(selected).length === 0) return null;

  // A partial choice whose remaining variants' own photos are all one gallery photo (9mm belts).
  const varied = new Set(
    [...new Set(variants.map((v) => v.supplierCode))].filter(
      (code) => new Set(variants.filter((v) => v.supplierCode === code).map((v) => (v.image ? photoKey(v.image) : ""))).size > 1,
    ),
  );
  const owned = new Set(candidates.flatMap((v) => (v.image && varied.has(v.supplierCode) && byKey.has(photoKey(v.image)) ? [photoKey(v.image)] : [])));
  if (owned.size === 1) return byKey.get([...owned][0])!;
  const fromOptions = coloursIn(Object.values(selected).join(" "));
  let colour: string | null = null;
  if (fromOptions.size === 1) colour = [...fromOptions][0];
  else if (fromOptions.size === 0 && candidates.length > 0) {
    const each = candidates.map((v) => coloursIn(v.sku ?? ""));
    const first = each[0];
    if (first.size === 1 && each.every((c) => c.size === 1 && c.has([...first][0]))) colour = [...first][0];
  }
  if (!colour) return null;

  const matches = gallery.filter((url) => coloursIn(stem(url)).has(colour));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const bases = new Set(candidates.flatMap((v) => (v.sku ? [skuBase(v.sku)] : [])));
    const named = matches.filter((url) => [...bases].some((base) => stem(url).split("_")[0] === base));
    if (named.length === 1) return named[0];
  }
  return null;
}

/**
 * How many thumbnails a row holds under the main photo (PP4): never a lone pair or one left over.
 * Up to 6 photos sit in one row at the usual size, 7 or 8 in one row of smaller ones, 9 to 12 in
 * two rows of half each (9: 5 and 4; 12: 6 and 6). On phones the row scrolls sideways instead.
 */
export function thumbColumns(count: number): number {
  if (count <= 6) return 6;
  if (count <= 8) return count;
  return Math.ceil(count / 2);
}
