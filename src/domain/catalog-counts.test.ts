import { describe, expect, it } from "vitest";
import { tallyFamilies, type CountedFamily } from "./catalog-counts";

const fam = (supplierCodes: string[], categoryId: string | null = "c1"): CountedFamily => ({ supplierCodes, categoryId });

describe("tallyFamilies", () => {
  it("counts each vendor from its own rows, so two vendors never share a count by accident", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => fam(["andymark"])),
      ...Array.from({ length: 3 }, () => fam(["wcp"])),
    ];
    const { vendors } = tallyFamilies(rows, ["andymark", "wcp"]);
    expect(vendors).toEqual({ andymark: 5, wcp: 3 });
  });

  it("gives a family two vendors sell to both, but counts it once in the total", () => {
    const rows = [fam(["andymark"]), fam(["andymark", "wcp"]), fam(["wcp"])];
    const counts = tallyFamilies(rows, ["andymark", "wcp"]);
    expect(counts.vendors).toEqual({ andymark: 2, wcp: 2 });
    expect(counts.families).toBe(3);
    expect(Object.values(counts.vendors).reduce((a, b) => a + b, 0)).toBeGreaterThan(counts.families);
  });

  it("lists an active vendor with nothing as 0, and leaves inactive vendors out", () => {
    const counts = tallyFamilies([fam(["andymark", "gone"])], ["andymark", "empty"]);
    expect(counts.vendors).toEqual({ andymark: 1, empty: 0 });
  });

  it("counts a family once for a vendor listed twice on it", () => {
    expect(tallyFamilies([fam(["wcp", "wcp"])], ["wcp"]).vendors.wcp).toBe(1);
  });

  it("counts categories, and a family with none still counts in the total", () => {
    const counts = tallyFamilies([fam(["wcp"], "c1"), fam(["wcp"], "c1"), fam(["wcp"], "c2"), fam(["wcp"], null)], ["wcp"]);
    expect(counts.categories).toEqual({ c1: 2, c2: 1 });
    expect(counts.families).toBe(4);
  });

  it("is all zero for an empty catalog", () => {
    expect(tallyFamilies([], ["wcp"])).toEqual({ families: 0, vendors: { wcp: 0 }, categories: {} });
  });
});
