import { describe, expect, it } from "vitest";
import { changedKeys, chipPrice, choose, linkedKeys, linkedValue, pick } from "./pick";

const gears = [
  { id: "a", options: { teeth: "12t", bore: "8mm SplineXS" } },
  { id: "b", options: { teeth: "36t", bore: '1/2" Hex' } },
  { id: "c", options: { teeth: "36t", bore: '3/8" Hex' } },
  { id: "d", options: { teeth: "100t", bore: '1/2" Hex' } },
];
const keys = ["teeth", "bore"];

describe("pick", () => {
  it("offers every value, in size order, before anything is chosen", () => {
    const p = pick(gears, keys, {});
    expect(p.chips.teeth.map((c) => c.value)).toEqual(["12t", "36t", "100t"]);
    expect(p.chips.bore.map((c) => c.value)).toEqual(['3/8" Hex', '1/2" Hex', "8mm SplineXS"]);
    expect(p.chosen).toBeNull();
  });

  it("fills in a key that has only one value left", () => {
    const p = pick(gears, keys, { teeth: "12t" });
    expect(p.selected).toEqual({ teeth: "12t", bore: "8mm SplineXS" });
    expect(p.chosen?.id).toBe("a");
  });

  it("greys out values that don't fit the other choices", () => {
    const p = pick(gears, keys, { teeth: "36t" });
    expect(p.chosen).toBeNull();
    expect(p.chips.bore.find((c) => c.value === "8mm SplineXS")?.enabled).toBe(false);
    expect(p.chips.bore.find((c) => c.value === '1/2" Hex')?.enabled).toBe(true);
    // Other teeth stay pickable, so a choice can be changed without clearing first.
    expect(p.chips.teeth.every((c) => c.enabled)).toBe(true);
  });

  it("settles on the first candidate when suppliers sell the same part", () => {
    const offers = [
      { id: "wcp", options: { teeth: "44t" } },
      { id: "ctre", options: { teeth: "44t" } },
      { id: "other", options: { teeth: "46t" } },
    ];
    expect(pick(offers, ["teeth"], { teeth: "44t" }).chosen?.id).toBe("wcp");
  });

  it("treats a missing option as its own choice instead of filling in the one value", () => {
    const wide: { id: string; options: Record<string, string> }[] = [
      { id: "std", options: { teeth: "40t", bore: '1/2" Hex' } },
      { id: "wide", options: { teeth: "40t", bore: "8mm SplineXS", width: '1/2"' } },
      { id: "std2", options: { teeth: "42t", bore: '1/2" Hex' } },
    ];
    const k = ["teeth", "bore", "width"];
    expect(pick(wide, k, {}).selected).toEqual({});
    expect(pick(wide, k, {}).chips.width.map((c) => c.value)).toEqual(["", '1/2"']);
    const p = pick(wide, k, { teeth: "40t", bore: '1/2" Hex' });
    expect(p.selected.width).toBe("");
    expect(p.chosen?.id).toBe("std");
  });

  it("ignores a choice the family doesn't have", () => {
    expect(pick(gears, keys, { bore: "Falcon" }).selected).toEqual({});
  });

  it("settles at once for a family without options", () => {
    expect(pick([{ id: "x", options: {} }], [], {}).chosen?.id).toBe("x");
  });
});

describe("choose", () => {
  it("adds, clears, and resets on a clash", () => {
    expect(choose(gears, keys, {}, "teeth", "36t")).toEqual({ teeth: "36t" });
    expect(choose(gears, keys, { teeth: "36t" }, "teeth", "36t")).toEqual({});
    expect(choose(gears, keys, { teeth: "12t", bore: "8mm SplineXS" }, "teeth", "100t")).toEqual({ teeth: "100t" });
  });
});

describe("chipPrice", () => {
  const priced = [
    { id: "a", priceIls: 40, options: { teeth: "36t", bore: '1/2" Hex' } },
    { id: "b", priceIls: 30, options: { teeth: "36t", bore: '3/8" Hex' } },
    { id: "c", priceIls: 55, options: { teeth: "60t", bore: '1/2" Hex' } },
    { id: "d", priceIls: null, options: { teeth: "84t", bore: '1/2" Hex' } },
  ];

  it("is the cheapest part a chip leads to", () => {
    expect(chipPrice(priced, {}, "teeth", "36t")).toBe(30);
  });

  it("follows the other choices, not the chip's own key", () => {
    expect(chipPrice(priced, { bore: '1/2" Hex' }, "teeth", "36t")).toBe(40);
    expect(chipPrice(priced, { teeth: "60t", bore: '1/2" Hex' }, "teeth", "36t")).toBe(40);
  });

  it("is null when nothing it leads to has a price", () => {
    expect(chipPrice(priced, {}, "teeth", "84t")).toBeNull();
    expect(chipPrice(priced, { bore: '3/8" Hex' }, "teeth", "60t")).toBeNull();
  });
});


describe("linkedKeys", () => {
  const bearings = [
    { id: "a", options: { id: "8mm", od: "22mm", width: "7mm" } },
    { id: "b", options: { id: "10mm", od: "26mm", width: "8mm" } },
    { id: "c", options: { id: "1/2\" Hex", od: "1.125\"", width: "7mm" } },
  ];
  it("puts ID and OD that always go together in one picker", () => {
    expect(linkedKeys(bearings, ["id", "od", "width"])).toEqual([["id", "od"], ["width"]]);
    expect(linkedValue(bearings, ["id", "od"], "8mm")).toBe("8mm × 22mm");
  });
  it("keeps independent keys apart", () => {
    const gears = [
      { id: "1", options: { teeth: "12t", bore: "Hex" } },
      { id: "2", options: { teeth: "12t", bore: "Round" } },
      { id: "3", options: { teeth: "14t", bore: "Hex" } },
    ];
    expect(linkedKeys(gears, ["teeth", "bore"])).toEqual([["teeth"], ["bore"]]);
  });
});

describe("changedKeys", () => {
  it("names the choices a tap changed elsewhere", () => {
    expect(changedKeys({ teeth: "12t", bore: "Hex" }, { teeth: "14t", bore: "Round" }, "teeth")).toEqual(["bore"]);
    expect(changedKeys({ teeth: "12t" }, { teeth: "14t" }, "teeth")).toEqual([]);
  });
});
