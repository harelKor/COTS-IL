import { describe, expect, it } from "vitest";
import { accentColor, accentStyle, darkLogo, homeVendorOrder, isStoreFront, vendorBlurb, vendorGlass, vendorHref, vendorNameList, vendorPalette, vendorTheme, vendorRows, spansBoth } from "./vendors";

describe("vendorNameList", () => {
  it("joins names as a Hebrew list", () => {
    expect(vendorNameList([])).toBe("");
    expect(vendorNameList(["AndyMark"])).toBe("AndyMark");
    expect(vendorNameList(["AndyMark", "WCP"])).toBe("AndyMark ו-WCP");
    expect(vendorNameList(["AndyMark", "WCP", "The Thrifty Bot"])).toBe("AndyMark, WCP ו-The Thrifty Bot");
  });
  it("lists all seven live vendors", () => {
    const names = ["AndyMark", "WCP", "goBILDA", "REV", "CTRE", "The Thrifty Bot", "Other"];
    const text = vendorNameList(names);
    for (const n of names) expect(text).toContain(n);
  });
});

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
    expect(isStoreFront({ q: "", category: "", group: "motion" })).toBe(false);
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

describe("vendorPalette", () => {
  it("gives the known vendors their own palette, by code or by name", () => {
    expect(vendorPalette({ code: "am", name: "AndyMark" })).toEqual({ primary: "#ef4444", secondary: "#dc2626", text: "#fca5a5", onPrimary: "#ffffff" });
    expect(vendorPalette({ code: "swerve", name: "Swerve Drive Specialties" }).text).toBe("#e2e8f0");
    expect(vendorPalette({ code: "ttb", name: "The Thrifty Bot" }).primary).toBe("#10b981");
  });
  it("puts dark text on bright brand fills and white on deep ones", () => {
    expect(vendorPalette({ code: "gobilda", name: "goBILDA" }).onPrimary).toBe("#020416");
    expect(vendorPalette({ code: "ctre", name: "CTR Electronics" }).onPrimary).toBe("#020416");
    expect(vendorPalette({ code: "wcp", name: "WCP" }).onPrimary).toBe("#ffffff");
  });
  it("falls back to the admin's accents, then Orbit ultramarine", () => {
    expect(vendorPalette({ code: "acme", name: "Acme", accentColor: "#000000", accentColor2: "#123456" })).toEqual({
      primary: "#000000",
      secondary: "#123456",
      text: "#737373",
      onPrimary: "#ffffff",
    });
    expect(vendorPalette({ code: "acme", name: "Acme", accentColor: null }).primary).toBe("#0018e0");
  });
});

describe("vendorTheme", () => {
  it("sets the store's custom properties, with the primary as an rgb triple", () => {
    expect(vendorTheme({ code: "rev", name: "REV Robotics" })).toEqual({
      "--vendor-primary": "#f97316",
      "--vendor-primary-rgb": "249 115 22",
      "--vendor-secondary": "#ea580c",
      "--vendor-text-accent": "#fdba74",
      "--vendor-on-primary": "#020416",
    });
  });
});

describe("vendorGlass", () => {
  it("is the palette's primary and text tint", () => {
    expect(vendorGlass({ code: "gobilda", name: "goBILDA" })).toEqual({ "--v-deep": "#f59e0b", "--v-light": "#fde047" });
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

describe("homeVendorOrder", () => {
  const v = (code: string, name = code) => ({ code, name });
  it("puts AndyMark, WCP and goBILDA first, in that order, and keeps the rest as given", () => {
    const order = homeVendorOrder([v("am", "AndyMark"), v("wcp"), v("gobilda", "goBILDA"), v("rev"), v("ctre")]);
    expect(order.map((x) => x.code)).toEqual(["am", "wcp", "gobilda", "rev", "ctre"]);
  });
  it("leaves a list without them alone", () => {
    expect(homeVendorOrder([v("rev"), v("ttb"), v("sds")]).map((x) => x.code)).toEqual(["rev", "ttb", "sds"]);
  });
});
