import { describe, expect, it } from "vitest";
import { catalogHref, clearAll, clearPanel, hasFilters, panelFilterCount, parseFilters, setRange, toggleSpec, toggleSupplier } from "./catalog-filters";

describe("ranges and the price (CF2)", () => {
  it("reads a from–to range on teeth, length and OD, and a price", () => {
    const f = parseFilters({ category: "gears", "s.teeth": "20-40", "s.length": "2-6in", "s.od": "-30mm", price: "50-200" });
    expect(f.ranges).toEqual({ teeth: { min: 20, max: 40 }, length: { min: 2, max: 6, unit: "in" }, od: { min: null, max: 30, unit: "mm" } });
    expect(f.specs).toEqual({});
    expect(f.price).toEqual({ min: 50, max: 200 });
    expect(hasFilters(f)).toBe(true);
  });

  it("reads a range only on keys that have one, and ignores a broken one", () => {
    expect(parseFilters({ "s.bore": "20-40" }).ranges).toEqual({});
    expect(parseFilters({ "s.teeth": "20-40-60" }).ranges).toEqual({});
    expect(parseFilters({ "s.teeth": "-" }).ranges).toEqual({});
    expect(parseFilters({ price: "cheap" }).price).toBeNull();
    expect(parseFilters({ price: "-1-5" }).price).toBeNull();
  });

  it("round-trips ranges and the price", () => {
    const href = catalogHref({ category: "gears", ranges: { teeth: { min: 20, max: 40 } }, specs: { bore: ['1/2" Hex'] }, price: { min: null, max: 200 } });
    expect(href).toBe("/catalog?category=gears&s.bore=1%2F2%22+Hex&s.teeth=20-40&price=-200");
    const params = new URLSearchParams(href.split("?")[1]);
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(params.keys())) raw[key] = params.getAll(key);
    const f = parseFilters(raw);
    expect(f.ranges).toEqual({ teeth: { min: 20, max: 40 } });
    expect(f.price).toEqual({ min: null, max: 200 });
  });

  it("keeps a key to values or a range, never both", () => {
    const base = parseFilters({ category: "gears", "s.teeth": ["24T"] });
    const ranged = setRange(base, "teeth", { min: 20, max: 40 });
    expect(ranged.specs).toEqual({});
    expect(ranged.ranges).toEqual({ teeth: { min: 20, max: 40 } });
    expect(toggleSpec(ranged, "teeth", "36T")).toMatchObject({ specs: { teeth: ["36T"] }, ranges: {} });
    expect(setRange(ranged, "teeth", null).ranges).toEqual({});
    // A link with both: the range wins.
    expect(parseFilters({ "s.teeth": ["24T", "20-40"] })).toMatchObject({ specs: {}, ranges: { teeth: { min: 20, max: 40 } } });
  });

  it("counts the panel's filters and clears them, keeping the category and the search", () => {
    const f = parseFilters({ q: "hub", category: "gears", program: "FRC", available: "1", "s.bore": ['1/2" Hex', '3/8" Hex'], "s.teeth": "20-40", price: "10-" });
    expect(panelFilterCount(f)).toBe(6);
    const cleared = clearPanel(f);
    expect(panelFilterCount(cleared)).toBe(0);
    expect(cleared).toMatchObject({ q: "hub", category: "gears" });
  });
});

describe("parseFilters", () => {
  it("reads valid values", () => {
    expect(
      parseFilters({ q: " gear ", category: "gears", supplier: "wcp", program: "FRC", available: "1", sort: "price-asc", page: "3" }),
    ).toEqual({
      q: "gear",
      category: "gears",
      group: "",
      suppliers: ["wcp"],
      program: "FRC",
      availableOnly: true,
      sort: "price-asc",
      page: 3,
      specs: {},
      ranges: {},
      price: null,
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
    const href = catalogHref({ category: "gears", specs: { teeth: ["36T"], bore: ['1/2" Hex', "SplineXS"] }, view: "list" });
    expect(href).toBe("/catalog?category=gears&s.bore=1%2F2%22+Hex&s.bore=SplineXS&s.teeth=36T&view=list");
    const params = new URLSearchParams(href.split("?")[1]);
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(params.keys())) raw[key] = params.getAll(key);
    expect(parseFilters(raw).specs).toEqual({ bore: ['1/2" Hex', "SplineXS"], teeth: ["36T"] });
  });

  it("reads an old link's spellings as the stored values (CF1)", () => {
    expect(parseFilters({ "s.bore": ["1/2 in. Hex", '0.5" Hex', "RS775"], "s.teeth": "36t" }).specs).toEqual({
      bore: ['1/2" Hex'],
      "motor-fit": ["RS775"],
      teeth: ["36T"],
    });
  });
});

describe("several vendors (CF3)", () => {
  it("reads one or more ?supplier= and writes them sorted", () => {
    expect(parseFilters({ supplier: "wcp" }).suppliers).toEqual(["wcp"]);
    expect(parseFilters({ supplier: ["wcp", "andymark", "wcp"] }).suppliers).toEqual(["wcp", "andymark"]);
    expect(parseFilters({ supplier: "bad code!" }).suppliers).toEqual([]);
    expect(parseFilters({}).suppliers).toEqual([]);
    expect(catalogHref({ category: "gears", suppliers: ["wcp", "andymark"] })).toBe("/catalog?category=gears&supplier=andymark&supplier=wcp");
  });

  it("toggles a vendor, and only the results row's clear drops them", () => {
    const f = parseFilters({ supplier: "wcp", program: "FRC", category: "gears" });
    expect(toggleSupplier(f, "andymark").suppliers).toEqual(["wcp", "andymark"]);
    expect(toggleSupplier(f, "wcp").suppliers).toEqual([]);
    expect(hasFilters(f)).toBe(true);
    expect(clearPanel(f)).toMatchObject({ suppliers: ["wcp"], program: "", category: "gears" });
    expect(clearAll(f)).toMatchObject({ suppliers: [], program: "", category: "gears" });
  });
});
