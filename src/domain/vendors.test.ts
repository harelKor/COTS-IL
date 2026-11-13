import { describe, expect, it } from "vitest";
import { accentColor, accentStyle, isStoreFront, vendorBlurb, vendorHref, vendorSpans } from "./vendors";

describe("vendorHref", () => {
  it("puts the vendor in the path and drops ?supplier=", () => {
    expect(vendorHref("wcp")).toBe("/v/wcp");
    expect(vendorHref("wcp", { supplier: "ctre", category: "gears" })).toBe("/v/wcp?category=gears");
    expect(vendorHref("ttb", { q: "swerve", page: 2 })).toBe("/v/ttb?q=swerve&page=2");
  });
});

describe("isStoreFront", () => {
  it("is the front page only without a search or category", () => {
    expect(isStoreFront({ q: "", category: "" })).toBe(true);
    expect(isStoreFront({ q: "kraken", category: "" })).toBe(false);
    expect(isStoreFront({ q: "", category: "motors" })).toBe(false);
  });
});

describe("accentColor", () => {
  it("accepts a 6-digit hex and nothing else", () => {
    expect(accentColor("#16A34A")).toBe("#16a34a");
    expect(accentColor(" #dc2626 ")).toBe("#dc2626");
    expect(accentColor("red")).toBeNull();
    expect(accentColor("#fff")).toBeNull();
    expect(accentColor("#16a34a; color: red")).toBeNull();
    expect(accentColor(null)).toBeNull();
    expect(accentStyle(null)).toBeUndefined();
    expect(accentStyle("#2563eb")).toEqual({ "--accent": "#2563eb" });
    expect(accentStyle("#97d700", "#111111")).toEqual({ "--accent": "#97d700", "--accent-2": "#111111" });
    expect(accentStyle(null, "#111111")).toBeUndefined();
    expect(accentStyle("#00aa00", "white")).toEqual({ "--accent": "#00aa00" });
  });
});

describe("vendorBlurb", () => {
  it("names the biggest categories", () => {
    expect(vendorBlurb([{ name: "גלגלים", count: 5 }, { name: "מנועים", count: 40 }, { name: "צירים", count: 9 }, { name: "כלים", count: 1 }])).toBe(
      "מנועים, צירים וגלגלים",
    );
    expect(vendorBlurb([{ name: "מצלמות", count: 2 }])).toBe("מצלמות");
    expect(vendorBlurb([])).toBeNull();
  });
});

describe("vendorSpans", () => {
  const rowsFull = (spans: number[], cols: number) => spans.reduce((a, b) => a + b, 0) % cols === 0;
  it("never leaves a gap in the last row, for any count", () => {
    for (let n = 1; n <= 13; n++) {
      const s = vendorSpans(n);
      expect(rowsFull(s.map((x) => x.sm), 2)).toBe(true);
      expect(rowsFull(s.map((x) => x.lg), 6)).toBe(true);
    }
  });
  it("widens only the last boxes", () => {
    expect(vendorSpans(4).map((x) => x.lg)).toEqual([2, 2, 2, 6]);
    expect(vendorSpans(5).map((x) => x.lg)).toEqual([2, 2, 2, 3, 3]);
    expect(vendorSpans(6).map((x) => x.lg)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(vendorSpans(3).map((x) => x.sm)).toEqual([1, 1, 2]);
  });
});
