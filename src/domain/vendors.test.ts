import { describe, expect, it } from "vitest";
import { accentColor, accentStyle, darkLogo, isStoreFront, vendorBlurb, vendorGlass, vendorHref, vendorRows, spansBoth } from "./vendors";

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

describe("vendorRows", () => {
  it("puts up to 3 vendors in the first row and the rest after", () => {
    expect(vendorRows(7)).toEqual({ first: 3, rest: 4 });
    expect(vendorRows(3)).toEqual({ first: 3, rest: 0 });
    expect(vendorRows(2)).toEqual({ first: 2, rest: 0 });
    expect(vendorRows(0)).toEqual({ first: 0, rest: 0 });
  });
});

describe("spansBoth", () => {
  it("widens only a lone last box, so 2-column rows are always full", () => {
    for (let n = 1; n <= 9; n++) {
      const cells = Array.from({ length: n }, (_, i) => (spansBoth(i, n) ? 2 : 1)).reduce((a, b) => a + b, 0);
      expect(cells % 2).toBe(0);
    }
    expect([0, 1, 2].map((i) => spansBoth(i, 3))).toEqual([false, false, true]);
    expect([0, 1, 2, 3].map((i) => spansBoth(i, 4))).toEqual([false, false, false, false]);
  });
});

describe("vendorGlass", () => {
  it("gives the known vendors their own colours, by code or by name", () => {
    expect(vendorGlass({ code: "gobilda", name: "goBILDA" })["--v-deep"]).toBe("#f59e0b");
    expect(vendorGlass({ code: "swerve", name: "Swerve Drive Specialties" })["--v-light"]).toBe("#cbd5e1");
    expect(vendorGlass({ code: "ttb", name: "The Thrifty Bot" })["--v-deep"]).toBe("#10b981");
  });
  it("falls back to the admin's accent, then Orbit blue", () => {
    expect(vendorGlass({ code: "acme", name: "Acme", accentColor: "#123456" })).toEqual({ "--v-deep": "#123456", "--v-light": "#123456" });
    expect(vendorGlass({ code: "acme", name: "Acme", accentColor: null })["--v-deep"]).toBe("#0a58ff");
  });
});

describe("darkLogo", () => {
  it("maps a bundled logo, by path or full URL, to its white-ink copy", () => {
    expect(darkLogo("https://cots-il.vercel.app/vendors/gobilda.svg")).toBe("/vendors/on-dark/gobilda.png");
    expect(darkLogo("http://localhost:3005/vendors/wcp.png")).toBe("/vendors/on-dark/wcp.png");
    expect(darkLogo("/vendors/sds.png")).toBe("/vendors/on-dark/sds.png");
  });
  it("leaves uploads and missing logos alone", () => {
    expect(darkLogo("https://x.supabase.co/storage/v1/object/public/supplier-logos/acme.png")).toBeNull();
    expect(darkLogo(null)).toBeNull();
  });
});
