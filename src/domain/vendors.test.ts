import { describe, expect, it } from "vitest";
import { isStoreFront, vendorBlurb, vendorHref } from "./vendors";

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

describe("vendorBlurb", () => {
  it("has a line for the four vendors and none for an unknown one", () => {
    for (const code of ["wcp", "ctre", "andymark", "ttb"]) expect(vendorBlurb(code)).toBeTruthy();
    expect(vendorBlurb("rev")).toBeNull();
  });
});
