import { describe, expect, it } from "vitest";
import { catalogHref, parseFilters, searchPatterns } from "./catalog-filters";

describe("parseFilters", () => {
  it("reads valid values", () => {
    expect(
      parseFilters({ q: " gear ", category: "gears", supplier: "wcp", program: "FRC", available: "1", sort: "price-asc", page: "3" }),
    ).toEqual({ q: "gear", category: "gears", supplier: "wcp", program: "FRC", availableOnly: true, sort: "price-asc", page: 3 });
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
});

describe("searchPatterns", () => {
  it("makes one pattern per word", () => {
    expect(searchPatterns("Hex  Gear")).toEqual(["%hex%", "%gear%"]);
  });

  it("escapes wildcards", () => {
    expect(searchPatterns("100%_a\\b")).toEqual(["%100\\%\\_a\\\\b%"]);
  });

  it("returns nothing for an empty search", () => {
    expect(searchPatterns("  ")).toEqual([]);
  });
});
