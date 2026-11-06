import { describe, expect, it } from "vitest";
import { ACCESSORY_TITLE_PATTERN, isAccessoryTitle, rankKey, type Rankable } from "./catalog-rank";

const family = (over: Partial<Rankable>): Rankable => ({
  title: "Kraken X60",
  categorySlug: "motors",
  available: true,
  minPriceUsd: 200,
  variantCount: 1,
  ...over,
});

const order = (rows: Rankable[]) =>
  [...rows]
    .sort((a, b) => {
      const ka = rankKey(a);
      const kb = rankKey(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return a.title.localeCompare(b.title);
    })
    .map((r) => r.title);

describe("isAccessoryTitle", () => {
  it("spots screws, spacers and packs", () => {
    expect(isAccessoryTitle('#4-40 x 3/8" BHCS (IP10, Kraken CAN PowerPole Adapter Board) (25-Pack)')).toBe(true);
    expect(isAccessoryTitle('1/2" L Aluminum Motor Spacer (Kraken X60)')).toBe(true);
    expect(isAccessoryTitle("Falcon 500 Hardware Kit")).toBe(true);
    expect(isAccessoryTitle("Hex Nuts")).toBe(true);
  });

  it("leaves main items and words that only contain the accessory words", () => {
    expect(isAccessoryTitle("CTR TalonFXS Motor Controller")).toBe(false);
    expect(isAccessoryTitle("AndyMark 775 RedLine Motor")).toBe(false);
    expect(isAccessoryTitle("Coverless Gearbox")).toBe(false);
    expect(isAccessoryTitle("Package Tracker")).toBe(false);
  });

  it("has a Postgres pattern with Postgres word boundaries", () => {
    expect(ACCESSORY_TITLE_PATTERN.startsWith("\\m")).toBe(true);
    expect(ACCESSORY_TITLE_PATTERN.endsWith("\\M")).toBe(true);
  });
});

describe("rankKey", () => {
  it("puts motors ahead of the screws filed with them", () => {
    expect(
      order([
        family({ title: '#4-40 x 1/4" BHCS (IP8, Kraken CAN Terminal) (25-Pack)', minPriceUsd: 4.99 }),
        family({ title: '1/4" L Aluminum Motor Spacer (Kraken X60)', minPriceUsd: 12.99 }),
        family({ title: "CTR TalonFXS Motor Controller", minPriceUsd: 125.99 }),
        family({ title: "5 mm Hex Servo Hub", minPriceUsd: 10 }),
        family({ title: "AndyMark 775 RedLine Motor", minPriceUsd: 25 }),
      ]),
    ).toEqual([
      "AndyMark 775 RedLine Motor",
      "CTR TalonFXS Motor Controller",
      "5 mm Hex Servo Hub",
      '#4-40 x 1/4" BHCS (IP8, Kraken CAN Terminal) (25-Pack)',
      '1/4" L Aluminum Motor Spacer (Kraken X60)',
    ]);
  });

  it("keeps available parts first", () => {
    expect(order([family({ title: "Falcon 500", available: false }), family({ title: "Spacer", minPriceUsd: 3 })])).toEqual([
      "Spacer",
      "Falcon 500",
    ]);
  });

  it("doesn't hold back screws in the fasteners category", () => {
    expect(
      order([
        family({ title: "Z Plate", categorySlug: "fasteners", minPriceUsd: 5 }),
        family({ title: "A Screw Pack", categorySlug: "fasteners", minPriceUsd: 5 }),
      ]),
    ).toEqual(["A Screw Pack", "Z Plate"]);
  });

  it("counts a family in many sizes as a main item", () => {
    expect(order([family({ title: "A Hub", minPriceUsd: 8 }), family({ title: "B Gear", minPriceUsd: 8, variantCount: 12 })])).toEqual([
      "B Gear",
      "A Hub",
    ]);
  });
});
