import { describe, expect, it } from "vitest";
import { coloursIn, dedupePhotos, followPhoto, imageSize, largeFirst, ownPhoto, photoKey } from "./gallery";

const WCP = "https://cdn.shopify.com/s/files/1/0440/0326/2624/files/";
const AM = "https://cdn.shopify.com/s/files/1/0644/2303/5052/files/";

describe("photoKey and dedupePhotos", () => {
  it("drops the query, Shopify's upload id and case", () => {
    expect(photoKey(`${WCP}15mmBelt_e4aa0b20-1fd3-4452-a243-1d60fa4c1dce.png?v=1708546325`)).toBe("15mmbelt.png");
    expect(photoKey(`${AM}am-3155_Blk_9a548fff-b8cc-4feb-852b-eb64f28813dc.jpg?v=1772133329`)).toBe("am-3155_blk.jpg");
    expect(photoKey(`${WCP}9mmBelts.png?v=1708546614`)).toBe("9mmbelts.png");
  });

  it("keeps one copy of the timing belt's repeated photos, in order", () => {
    const belt = [
      `${WCP}15mmBelt_e4aa0b20-1fd3-4452-a243-1d60fa4c1dce.png?v=1`,
      `${WCP}9mmBelts_6affff84-7da9-4c9d-bc45-e544f5c460a0.png?v=2`,
      `${WCP}15mmBelt_e2ebbd2b-f86c-4752-8c39-f32e520f3a11.png?v=3`,
      `${WCP}9mmBelts_46322c94-54b3-44b7-a42d-9f7a7a77a219.png?v=4`,
      "https://cdn.shopify.com/s/files/1/0668/2981/1885/files/15mmBelt.webp?v=5",
    ];
    expect(dedupePhotos(belt)).toEqual([belt[0], belt[1], belt[4]]);
  });
});

describe("largeFirst", () => {
  const urls = ["a.png", "b.webp", "c.png", "d.png"];
  it("puts the first large photo first when the first one is small (the Kraken)", () => {
    const sizes = [{ width: 650, height: 650 }, { width: 650, height: 650 }, { width: 2048, height: 2048 }, { width: 2493, height: 2275 }];
    expect(largeFirst(urls, sizes)).toEqual(["c.png", "a.png", "b.webp", "d.png"]);
  });
  it("leaves the order when the first photo is large, unknown, or nothing is large", () => {
    expect(largeFirst(urls, [{ width: 1600, height: 1600 }, null, { width: 2048, height: 2048 }, null])).toEqual(urls);
    expect(largeFirst(urls, [null, { width: 2048, height: 2048 }, null, null])).toEqual(urls);
    expect(largeFirst(urls, [{ width: 650, height: 650 }, { width: 900, height: 900 }, null, null])).toEqual(urls);
  });
});

describe("imageSize", () => {
  const bytes = (...parts: (number[] | string)[]) =>
    Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

  it("reads a PNG header", () => {
    const png = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], "IHDR", [0, 0, 0x02, 0x8a, 0, 0, 0x08, 0x00]);
    expect(imageSize(png)).toEqual({ width: 650, height: 2048 });
  });

  it("reads a JPEG's frame after its Exif block", () => {
    const exif = [0xff, 0xe1, 0, 8, 1, 2, 3, 4, 5, 6];
    const sof = [0xff, 0xc2, 0, 17, 8, 0x06, 0x40, 0x06, 0x40, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(imageSize(bytes([0xff, 0xd8], exif, sof))).toEqual({ width: 1600, height: 1600 });
  });

  it("reads WebP in its three forms", () => {
    const head = (chunk: string) => bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk, [0, 0, 0, 0]);
    const join = (a: Uint8Array, b: number[]) => Uint8Array.from([...a, ...b]);
    // VP8X: canvas 2048 × 1024 stored minus one, 24-bit little endian.
    expect(imageSize(join(head("VP8X"), [0, 0, 0, 0, 0xff, 0x07, 0, 0xff, 0x03, 0]))).toEqual({ width: 2048, height: 1024 });
    // VP8 (lossy): frame tag, start code, then 14-bit sizes.
    expect(imageSize(join(head("VP8 "), [0, 0, 0, 0x9d, 0x01, 0x2a, 0x8a, 0x02, 0x8a, 0x02]))).toEqual({ width: 650, height: 650 });
    // VP8L (lossless): signature, then width-1 and height-1 in 14 bits each.
    const w = 649, h = 649;
    const bits = w | (h << 14);
    expect(imageSize(join(head("VP8L"), [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff, 0, 0, 0, 0, 0]))).toEqual({ width: 650, height: 650 });
  });

  it("returns null for anything else or a cut-off header", () => {
    expect(imageSize(bytes("<html>not an image</html>"))).toBeNull();
    expect(imageSize(bytes([0x89], "PNG"))).toBeNull();
  });
});

describe("coloursIn", () => {
  it("finds colour words by whole word, spellings merged", () => {
    expect([...coloursIn("am-3155_Blk")]).toEqual(["black"]);
    expect([...coloursIn("Grey (60A)")]).toEqual(["gray"]);
    expect(coloursIn("shredder-bracket").size).toBe(0);
  });
});

describe("followPhoto", () => {
  // Stealth wheels: every variant shares the product's first photo; the colour is in the SKU only.
  const gallery = [
    `${AM}am-stealthwheel_1_dc9c722d-ce0d-42b3-9022-24a5b9752162.jpg?v=1`,
    `${AM}am-3155_green_f562f6be-01d8-43cf-a48e-a6acf51b1d37.jpg?v=1`,
    `${AM}am-3155_Blk_9a548fff-b8cc-4feb-852b-eb64f28813dc.jpg?v=1`,
    `${AM}am-3155_blue_f471abdf-fab8-4c10-84db-1c15640b916c.jpg?v=1`,
    `${AM}am-3155_5c04c9fe-3af4-4186-b318-103999769ed0.jpg?v=1`,
    `${AM}am-3156_Blue_e56a9c71-34db-427c-9345-fbdee2a995e3.jpg?v=1`,
    `${AM}am-3156_orange_5f418855-6afc-4036-a90c-20bb3f54f798.jpg?v=1`,
  ];
  const wheel = (sku: string, diameter: string, durometer: string) => ({
    sku,
    supplierCode: "andymark",
    image: gallery[0],
    options: { bore: "1/2 in Hex", diameter, durometer },
  });
  const stealth = [
    wheel("am-3155", "2 inch", "80A"),
    wheel("am-3155_green", "2 inch", "35A"),
    wheel("am-3155_blue", "2 inch", "50A"),
    wheel("am-3156_blue", "3 inch", "50A"),
    wheel("am-4541_green", "4 inch", "35A"),
    wheel("am-4541_orange", "4 inch", "40A"),
  ];

  it("picking 35A alone shows the green wheel: every remaining SKU says green, one photo does", () => {
    const candidates = stealth.filter((v) => v.options.durometer === "35A");
    expect(followPhoto(gallery, candidates, null, stealth, { durometer: "35A" })).toBe(gallery[1]);
  });

  it("a settled choice shows the photo named after its SKU, even without a colour", () => {
    expect(followPhoto(gallery, [stealth[0]], stealth[0], stealth, stealth[0].options)).toBe(gallery[4]);
    expect(followPhoto(gallery, [stealth[1]], stealth[1], stealth, stealth[1].options)).toBe(gallery[1]);
  });

  it("two blue photos: the one naming the SKU's base wins, otherwise nothing changes", () => {
    const twoInch = stealth.filter((v) => v.options.durometer === "50A" && v.options.diameter === "2 inch");
    expect(followPhoto(gallery, twoInch, null, stealth, { durometer: "50A", diameter: "2 inch" })).toBe(gallery[3]);
    const both = stealth.filter((v) => v.options.durometer === "50A");
    expect(followPhoto(gallery, both, null, stealth, { durometer: "50A" })).toBeNull();
  });

  it("a colour in the option value itself counts, and nothing picked means no change", () => {
    const shirts = [
      { sku: "x-1", supplierCode: "s", image: null, options: { color: "Orange" } },
      { sku: "x-2", supplierCode: "s", image: null, options: { color: "Blue" } },
    ];
    expect(followPhoto(gallery, [shirts[0]], null, shirts, { color: "Orange" })).toBe(gallery[6]);
    expect(followPhoto(gallery, stealth, null, stealth, {})).toBeNull();
  });

  it("a variant's own photo wins when it tells the vendor's variants apart", () => {
    const belts = [
      { sku: "WCP-1", supplierCode: "wcp", image: `${WCP}15mmBelt_aaaaaaaa-1111-2222-3333-444444444444.png?v=9`, options: { width: "15mm" } },
      { sku: "WCP-2", supplierCode: "wcp", image: `${WCP}9mmBelts.png?v=9`, options: { width: "9mm" } },
    ];
    const beltGallery = [`${WCP}15mmBelt_e4aa0b20-1fd3-4452-a243-1d60fa4c1dce.png?v=1`, `${WCP}9mmBelts_6affff84-7da9-4c9d-bc45-e544f5c460a0.png?v=2`];
    expect(followPhoto(beltGallery, [belts[1]], belts[1], belts, belts[1].options)).toBe(beltGallery[1]);
    // A partial choice: every remaining belt's own photo is the 9mm one.
    const nine = [belts[1], { ...belts[1], sku: "WCP-3", image: `${WCP}9mmBelts_6affff84-7da9-4c9d-bc45-e544f5c460a0.png?v=2` }];
    expect(followPhoto(beltGallery, nine, null, [...belts, nine[1]], { width: "9mm" })).toBe(beltGallery[1]);
    expect(ownPhoto(belts[0], belts)).toBe(belts[0].image);
    // One variant per vendor (the Kraken): its photo is the product's, not the choice's.
    const kraken = [
      { sku: "WCP-0940", supplierCode: "wcp", image: "https://x/WCP-0940.png", options: {} },
      { sku: "WCP-0940", supplierCode: "ctre", image: "https://x/kraken.webp", options: {} },
    ];
    expect(ownPhoto(kraken[0], kraken)).toBeNull();
    // Its WCP SKU names the small photo, but a single variant has no choice to show.
    const krakenGallery = ["https://x/big-front.png", "https://x/WCP-0940_5ea3e5cb-fbd2-440a-af41-ed7d48bbbae5.png"];
    expect(followPhoto(krakenGallery, kraken, kraken[0], kraken, {})).toBeNull();
  });
});
