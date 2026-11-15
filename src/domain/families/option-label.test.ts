import { describe, expect, it } from "vitest";
import { compareDisplay, isLargeGroup, optionDisplay, orderGroups } from "./option-label";

describe("optionDisplay", () => {
  it("reads AndyMark's gearbox ratios as the ratio, with the stages under it", () => {
    expect(optionDisplay("2 Stage - 06.00:1 Ratio")).toEqual({ label: "6:1", sub: "2 שלבים" });
    expect(optionDisplay("2 Stage - 04.77:1 Ratio")).toEqual({ label: "4.77:1", sub: "2 שלבים" });
    expect(optionDisplay("3 Stage - 25.90:1 Ratio 1.14:1")).toEqual({ label: "25.9:1", sub: "3 שלבים, 1.14:1" });
    expect(optionDisplay("1 Stage - 03.00:1 Ratio")).toEqual({ label: "3:1", sub: "שלב אחד" });
  });

  it("leaves other values as they are", () => {
    expect(optionDisplay("1/2 in Hex")).toEqual({ label: "1/2 in Hex", sub: null });
    expect(optionDisplay("AM14U Family Hex")).toEqual({ label: "AM14U Family Hex", sub: null });
    expect(optionDisplay("35A")).toEqual({ label: "35A", sub: null });
    expect(optionDisplay("12:1")).toEqual({ label: "12:1", sub: null });
  });
});

describe("compareDisplay", () => {
  it("sorts ratios by their number, whatever the stages", () => {
    const values = ["3 Stage - 12.41:1 Ratio 1.14:1", "2 Stage - 06.00:1 Ratio", "3 Stage - 05.45:1 Ratio 1.14:1", "2 Stage - 04.77:1 Ratio", "2 Stage - 22.67:1 Ratio"];
    expect([...values].sort(compareDisplay).map((v) => optionDisplay(v).label)).toEqual(["4.77:1", "5.45:1", "6:1", "12.41:1", "22.67:1"]);
  });

  it("sorts teeth as numbers", () => {
    expect(["195t", "30t", "100t", "35t"].sort(compareDisplay)).toEqual(["30t", "35t", "100t", "195t"]);
  });
});

describe("isLargeGroup", () => {
  it("keeps chips for small groups with short labels", () => {
    expect(isLargeGroup(["9mm", "15mm"])).toBe(false);
    expect(isLargeGroup(["35A", "40A", "50A", "60A", "80A"])).toBe(false);
    // Three long labels still fit two rows of chips.
    expect(isLargeGroup(["Short Keyed", "AM14U Family Hex", "Short Hex"])).toBe(false);
  });

  it("makes a list of many values or long labels", () => {
    expect(isLargeGroup(Array.from({ length: 54 }, (_, i) => `${i + 30}t`))).toBe(true);
    expect(isLargeGroup(Array.from({ length: 9 }, (_, i) => `${i}`))).toBe(true);
    expect(isLargeGroup(["Aluminum Black Anodized", "Steel", "Brass", "Bronze"])).toBe(true);
  });
});

describe("orderGroups", () => {
  it("puts small groups first and keeps the supplier's order within each", () => {
    const groups = [["teeth"], ["width"], ["bore"]];
    const large = (g: string[]) => g[0] === "teeth";
    expect(orderGroups(groups, large)).toEqual([["width"], ["bore"], ["teeth"]]);
  });
});
