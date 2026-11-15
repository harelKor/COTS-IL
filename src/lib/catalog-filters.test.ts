import { describe, expect, it } from "vitest";
import { catalogHref, hasFilters, parseFilters, toggleSpec } from "./catalog-filters";

describe("parseFilters", () => {
  it("reads valid values", () => {
    expect(
      parseFilters({ q: " gear ", category: "gears", supplier: "wcp", program: "FRC", available: "1", sort: "price-asc", page: "3" }),
    ).toEqual({
      q: "gear",
      category: "gears",
      group: "",
      supplier: "wcp",
      program: "FRC",
      availableOnly: true,
      sort: "price-asc",
      page: 3,
      specs: {},
      view: "grid",
    });
  });

  it("falls back to defaults on bad input", () => {
    expect(parseFilters({ program: "VEX", sort: "x", page: "-1", available: "yes" })).toMatchObject({
      program: "",
      sort: "relevance",
      page: 1,
      availableOnly: false,
    });
    expect(parseFilters({ page: "1.5" }).page).toBe(1);
  });

  it("uses the first value of a repeated parameter", () => {
    expect(parseFilters({ q: ["a", "b"] }).q).toBe("a");
  });

  it("reads spec filters, keeping every value of a repeated one", () => {
    const f = parseFilters({ "s.bore": ['1/2" Hex', '3/8" Hex'], "s.dp": "20 DP", "s.BAD KEY": "x", "s.teeth": "" });
    expect(f.specs).toEqual({ bore: ['1/2" Hex', '3/8" Hex'], dp: ["20 DP"] });
  });

  it("caps how many pages one URL can load", () => {
    expect(parseFilters({ page: "999" }).page).toBe(20);
  });

  it("reads the list view", () => {
    expect(parseFilters({ view: "list" }).view).toBe("list");
    expect(parseFilters({ view: "table" }).view).toBe("grid");
  });
});

describe("group filter", () => {
  it("reads and writes the group, with or without a category", () => {
    expect(parseFilters({ group: "motion" }).group).toBe("motion");
    expect(parseFilters({ group: "bad group!" }).group).toBe("");
    expect(catalogHref({ group: "motion" })).toBe("/catalog?group=motion");
    expect(catalogHref({ group: "motion", category: "gears" })).toBe("/catalog?category=gears&group=motion");
    expect(catalogHref({})).toBe("/catalog");
  });
});

describe("toggleSpec", () => {
  const base = parseFilters({ category: "gears", page: "3" });

  it("adds and removes values, and starts again from page 1", () => {
    const one = toggleSpec(base, "bore", '1/2" Hex');
    expect(one.specs).toEqual({ bore: ['1/2" Hex'] });
    expect(one.page).toBe(1);
    expect(toggleSpec(toggleSpec(one, "bore", '3/8" Hex'), "bore", '1/2" Hex').specs).toEqual({ bore: ['3/8" Hex'] });
    expect(toggleSpec(one, "bore", '1/2" Hex').specs).toEqual({});
  });

  it("counts spec filters as filters", () => {
    expect(hasFilters(base)).toBe(false);
    expect(hasFilters(toggleSpec(base, "dp", "20 DP"))).toBe(true);
  });
});

describe("catalogHref", () => {
  it("leaves out defaults", () => {
    expect(catalogHref({})).toBe("/catalog");
    expect(catalogHref({ sort: "relevance", page: 1, q: "" })).toBe("/catalog");
  });

  it("keeps filters and encodes values", () => {
    expect(catalogHref({ q: "a b", program: "FTC", availableOnly: true, page: 2 })).toBe(
      "/catalog?q=a+b&program=FTC&available=1&page=2",
    );
  });

  it("writes spec filters in a stable order and round-trips them", () => {
    const href = catalogHref({ category: "gears", specs: { teeth: ["36t"], bore: ['1/2" Hex', "8mm SplineXS"] }, view: "list" });
    expect(href).toBe("/catalog?category=gears&s.bore=1%2F2%22+Hex&s.bore=8mm+SplineXS&s.teeth=36t&view=list");
    const params = new URLSearchParams(href.split("?")[1]);
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(params.keys())) raw[key] = params.getAll(key);
    expect(parseFilters(raw).specs).toEqual({ bore: ['1/2" Hex', "8mm SplineXS"], teeth: ["36t"] });
  });
});
