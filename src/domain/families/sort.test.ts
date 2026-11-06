import { describe, expect, it } from "vitest";
import { optionLabel, sortByOptions } from "./sort";

const row = (familyOptions: Record<string, string>) => ({ familyOptions });

describe("sortByOptions", () => {
  it("sorts sizes by their number, not as text", () => {
    const rows = [row({ teeth: "100t" }), row({ teeth: "12t" }), row({ teeth: "36t" })];
    expect(sortByOptions(rows, ["teeth"]).map((r) => r.familyOptions.teeth)).toEqual(["12t", "36t", "100t"]);
  });

  it("sorts by each key in turn", () => {
    const rows = [row({ width: "15mm", teeth: "60t" }), row({ width: "9mm", teeth: "80t" }), row({ width: "9mm", teeth: "60t" })];
    expect(sortByOptions(rows, ["width", "teeth"]).map((r) => `${r.familyOptions.width}/${r.familyOptions.teeth}`)).toEqual([
      "9mm/60t",
      "9mm/80t",
      "15mm/60t",
    ]);
  });

  it("sorts fractions as inches and names alphabetically", () => {
    const rows = [row({ bore: '1/2" Hex' }), row({ bore: '3/8" Hex' }), row({ bore: "SplineXL" })];
    expect(sortByOptions(rows, ["bore"]).map((r) => r.familyOptions.bore)).toEqual(['3/8" Hex', '1/2" Hex', "SplineXL"]);
  });

  it("puts variants without the option last", () => {
    const rows = [row({}), row({ teeth: "20t" })];
    expect(sortByOptions(rows, ["teeth"])[0].familyOptions.teeth).toBe("20t");
  });
});

describe("optionLabel", () => {
  it("names known keys in Hebrew and turns supplier option names into words", () => {
    expect(optionLabel("bore")).toBe("קדח");
    expect(optionLabel("flux-capacitor")).toBe("flux capacitor");
  });

  it("names common FRC/FTC spec keys in Hebrew, whatever their case or spelling", () => {
    expect(optionLabel("pinion")).toBe("פיניון");
    expect(optionLabel("Ratio")).toBe("יחס העברה");
    expect(optionLabel("gear-ratio")).toBe("יחס העברה");
    expect(optionLabel("thread")).toBe("הברגה");
    expect(optionLabel("option")).toBe("אפשרות");
    expect(optionLabel("year")).toBe("שנה");
  });

  it("strips '# of' and 'number of' from counts", () => {
    expect(optionLabel("of-motors")).toBe("מס׳ מנועים");
    expect(optionLabel("number-of-motors")).toBe("מס׳ מנועים");
    expect(optionLabel("# of Motors")).toBe("מס׳ מנועים");
    expect(optionLabel("motors")).toBe("מס׳ מנועים");
  });

  it("builds a label for qualified and plural keys", () => {
    expect(optionLabel("shaft-type")).toBe("סוג ציר");
    expect(optionLabel("wheel-size")).toBe("מידת גלגל");
    expect(optionLabel("colors")).toBe("צבע");
  });
});
