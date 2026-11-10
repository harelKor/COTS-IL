import { describe, expect, it } from "vitest";
import { facetCountPlans, isRelevantFacet } from "./facets";

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
