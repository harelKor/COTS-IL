import { describe, expect, it } from "vitest";
import {
  defaultOpenFacets,
  facetCountPlans,
  facetLayout,
  formatPrice,
  formatRange,
  isFacetOpen,
  isRelevantFacet,
  orderFacetValues,
  parsePrice,
  parseRange,
  previewValues,
  rangeInSortUnits,
  rangeLabel,
  readBound,
  showsCoverage,
} from "./facets";

describe("the filter panel (CF2)", () => {
  const v = (value: string, count: number, num: number | null = null) => ({ value, count, num });

  it("shows up to 10 values as chips and more as a list", () => {
    expect(facetLayout(10)).toBe("chips");
    expect(facetLayout(11)).toBe("list");
  });

  it("sorts sizes ascending, and other values by how common they are", () => {
    const teeth = orderFacetValues([v("48T", 3, 48), v("12T", 9, 12), v("200T", 1, 200), v("20T", 5, 20)]);
    expect(teeth.map((x) => x.value)).toEqual(["12T", "20T", "48T", "200T"]);
    // Bores: mm and inches by size; a named spline (no size) last.
    const bores = orderFacetValues([v("Falcon Spline", 9), v('1/2" Hex', 20, 12.7), v("8mm Round", 4, 8), v('3/8" Hex', 6, 9.525)]);
    expect(bores.map((x) => x.value)).toEqual(["8mm Round", '3/8" Hex', '1/2" Hex', "Falcon Spline"]);
    const materials = orderFacetValues([v("Steel", 4), v("Aluminum", 30), v("Plastic", 4)]);
    expect(materials.map((x) => x.value)).toEqual(["Aluminum", "Plastic", "Steel"]);
  });

  it("previews the most common values and the chosen ones, in the facet's order", () => {
    const values = [v("10T", 1), v("12T", 9), v("14T", 2), v("16T", 8), v("18T", 7)];
    expect(previewValues(values, [], 2).map((x) => x.value)).toEqual(["12T", "16T"]);
    expect(previewValues(values, ["10T"], 2).map((x) => x.value)).toEqual(["10T", "12T", "16T"]);
  });

  it("opens the two facets most products have, then keeps the user's choice", () => {
    const facets = [
      { key: "dp", reach: 47 },
      { key: "teeth", reach: 89 },
      { key: "bore", reach: 58 },
      { key: "material", reach: 86 },
    ];
    const open = defaultOpenFacets(facets);
    expect(open).toEqual(["teeth", "material"]);
    expect(isFacetOpen("dp", open, {})).toBe(false);
    expect(isFacetOpen("dp", open, { dp: true })).toBe(true);
    expect(isFacetOpen("teeth", open, { teeth: false })).toBe(false);
  });

  it("notes coverage under ~90%", () => {
    expect(showsCoverage(45, 167)).toBe(true);
    expect(showsCoverage(160, 167)).toBe(false);
    expect(showsCoverage(0, 0)).toBe(false);
  });

  it("reads ranges safely", () => {
    expect(parseRange("teeth", "20-40")).toEqual({ min: 20, max: 40 });
    expect(parseRange("teeth", "40-20")).toEqual({ min: 20, max: 40 });
    expect(parseRange("teeth", "20-")).toEqual({ min: 20, max: null });
    expect(parseRange("length", "2.5-6")).toEqual({ min: 2.5, max: 6, unit: "in" });
    expect(parseRange("od", "10-22mm")).toEqual({ min: 10, max: 22, unit: "mm" });
    expect(parseRange("teeth", "20-40mm")).toBeNull();
    expect(parseRange("od", "10-22ft")).toBeNull();
    expect(parseRange("bore", "1-2")).toBeNull();
    expect(parseRange("teeth", "-")).toBeNull();
    expect(parseRange("teeth", "1e9-2")).toBeNull();
    expect(parseRange("teeth", "9999999-1")).toBeNull();
    expect(formatRange({ min: 2, max: null, unit: "in" })).toBe("2-in");
    expect(parseRange("length", formatRange({ min: 2, max: null, unit: "in" }))).toEqual({ min: 2, max: null, unit: "in" });
  });

  it("compares ranges in the units the values sort by", () => {
    expect(rangeInSortUnits({ min: 1, max: 2, unit: "in" })).toEqual({ min: 25.4, max: 50.8 });
    expect(rangeInSortUnits({ min: 20, max: null })).toEqual({ min: 20, max: null });
  });

  it("labels a range", () => {
    expect(rangeLabel("teeth", { min: 20, max: 40 })).toBe("20T–40T");
    expect(rangeLabel("length", { min: 2, max: 6, unit: "in" })).toBe('2"–6"');
    expect(rangeLabel("od", { min: 20, max: null, unit: "mm" })).toBe("מ-20mm");
    expect(rangeLabel("teeth", { min: null, max: 40 })).toBe("עד 40T");
  });

  it("reads the price and the from–to fields", () => {
    expect(parsePrice("50-200")).toEqual({ min: 50, max: 200 });
    expect(parsePrice("-200")).toEqual({ min: null, max: 200 });
    expect(parsePrice("200-50")).toEqual({ min: 50, max: 200 });
    expect(parsePrice("50.5-200")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(formatPrice({ min: 50, max: null })).toBe("50-");
    expect(readBound(" 1,250 ")).toBe(1250);
    expect(readBound("2.5")).toBe(2.5);
    expect(readBound("abc")).toBeNull();
    expect(readBound("")).toBeNull();
  });

  it("plans counts for a range like for values", () => {
    const plans = facetCountPlans<string[] | { min: number | null; max: number | null }>({ teeth: { min: 20, max: 40 }, bore: [] });
    expect(plans).toEqual([
      { keys: { except: ["teeth"] }, specs: { teeth: { min: 20, max: 40 } } },
      { keys: { only: "teeth" }, specs: {} },
    ]);
  });
});

describe("isRelevantFacet", () => {
  it("drops a spec only a couple of products have", () => {
    // Motors: 2 of 94 have an outer diameter, 8 of 94 a length.
    expect(isRelevantFacet({ key: "od", families: 2, values: 2 }, 94)).toBe(false);
    expect(isRelevantFacet({ key: "length", families: 8, values: 7 }, 94)).toBe(false);
  });

  it("keeps a spec most of the products have", () => {
    // Gears: 61 of 87 have a tooth count, 39 a bore.
    expect(isRelevantFacet({ key: "teeth", families: 61, values: 84 }, 87)).toBe(true);
    expect(isRelevantFacet({ key: "bore", families: 39, values: 32 }, 87)).toBe(true);
  });

  it("drops a spec with nothing to choose between", () => {
    expect(isRelevantFacet({ key: "material", families: 50, values: 1 }, 60)).toBe(false);
  });

  it("needs a few products even in a small result", () => {
    expect(isRelevantFacet({ key: "bore", families: 2, values: 2 }, 5)).toBe(false);
    expect(isRelevantFacet({ key: "bore", families: 3, values: 2 }, 5)).toBe(true);
  });

  it("keeps a spec the user already filtered by", () => {
    expect(isRelevantFacet({ key: "od", families: 1, values: 1 }, 94, ["od"])).toBe(true);
  });
});

describe("facetCountPlans", () => {
  it("counts everything under no filters when nothing is chosen", () => {
    expect(facetCountPlans({})).toEqual([{ keys: { except: [] }, specs: {} }]);
  });

  it("counts a chosen spec under the other filters only", () => {
    const plans = facetCountPlans({ bore: ['1/2" Hex'], teeth: ["20", "24"] });
    expect(plans).toEqual([
      { keys: { except: ["bore", "teeth"] }, specs: { bore: ['1/2" Hex'], teeth: ["20", "24"] } },
      { keys: { only: "bore" }, specs: { teeth: ["20", "24"] } },
      { keys: { only: "teeth" }, specs: { bore: ['1/2" Hex'] } },
    ]);
  });

  it("ignores a key with no values", () => {
    expect(facetCountPlans({ bore: [] })).toEqual([{ keys: { except: [] }, specs: {} }]);
  });
});
