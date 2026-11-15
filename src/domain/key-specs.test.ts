import { describe, expect, it } from "vitest";
import { KEY_SPECS, keySpecColumns, keySpecKeys, keySpecsOf, summarizeSpec, type SpecValue } from "./key-specs";

const v = (key: string, value: string, num: number | null = null, unit: string | null = null): SpecValue => ({ key, value, num, unit });

describe("summarizeSpec", () => {
  it("shows one value as it is", () => {
    expect(summarizeSpec([v("bore", '1/2" Hex', 0.5, "in"), v("bore", '1/2" Hex', 0.5, "in")])).toBe('1/2" Hex');
  });

  it("is a range for three or more sizes, in size order", () => {
    expect(summarizeSpec([v("teeth", "60T", 60, "T"), v("teeth", "12T", 12, "T"), v("teeth", "100T", 100, "T")])).toBe("12T – 100T");
    expect(summarizeSpec([v("od", '1"', 1, "in"), v("od", '3/8"', 0.375, "in"), v("od", '1/2"', 0.5, "in")])).toBe('3/8" – 1"');
  });

  it("puts a spaced unit once", () => {
    expect(summarizeSpec([v("dp", "32 DP", 32, "DP"), v("dp", "20 DP", 20, "DP"), v("dp", "48 DP", 48, "DP")])).toBe("20–48 DP");
  });

  it("lists two short values", () => {
    expect(summarizeSpec([v("teeth", "24T", 24, "T"), v("teeth", "12T", 12, "T")])).toBe("12T, 24T");
  });

  it("counts shapes and mixed units instead of a long list", () => {
    expect(summarizeSpec([v("bore", '1/2" Hex', 0.5, "in"), v("bore", "8mm Round", 8, "mm"), v("bore", '3/8" Hex', 0.375, "in")])).toBe("3 אפשרויות");
    expect(summarizeSpec([v("id", "8mm", 8, "mm"), v("id", '1/2"', 0.5, "in"), v("id", "12mm", 12, "mm")])).toBe("3 אפשרויות");
  });

  it("is null with no values", () => {
    expect(summarizeSpec([])).toBeNull();
  });
});

describe("keySpecsOf", () => {
  it("reads a column's first key the family has", () => {
    const gears = keySpecColumns("gears");
    const cells = keySpecsOf(gears, [
      v("module", "MOD 0.8"),
      v("teeth", "20T", 20, "T"),
      v("teeth", "40T", 40, "T"),
      v("bore", '1/2" Hex', 0.5, "in"),
      v("bore", "8mm Round", 8, "mm"),
      v("bore", "SplineXS"),
    ]);
    expect(cells).toEqual([
      { label: "DP", value: "MOD 0.8", ltr: true },
      { label: "שיניים", value: "20T, 40T", ltr: true },
      { label: "קדח", value: "3 אפשרויות", ltr: false },
    ]);
    expect(keySpecsOf(keySpecColumns("shafts"), [])).toEqual([
      { label: "צורה", value: null, ltr: true },
      { label: "קוטר חיצוני", value: null, ltr: true },
      { label: "אורך", value: null, ltr: true },
    ]);
  });

  it("has columns for the four categories, two or three each", () => {
    for (const slug of ["gears", "bearings", "belts-chain", "shafts"]) {
      expect(KEY_SPECS[slug].length).toBeGreaterThanOrEqual(2);
      expect(KEY_SPECS[slug].length).toBeLessThanOrEqual(3);
    }
    expect(keySpecColumns("wheels")).toEqual([]);
    expect(keySpecColumns(null)).toEqual([]);
    expect(keySpecKeys(keySpecColumns("bearings"))).toEqual(["id", "bore", "od", "width"]);
  });
});
