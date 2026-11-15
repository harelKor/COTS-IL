import { describe, expect, it } from "vitest";
import { pitchFromDescription, specsFromText, teethFromText } from "./extract";
import { boreFromText } from "./normalize";
import { formatInchNumber, normalizeSizes, sortValue } from "./units";
import { variantSpecs } from "./variant-specs";

const show = (specs: { key: string; value: string }[]) => specs.map((s) => `${s.key}:${s.value}`).join(" + ");

describe("sizes", () => {
  it("writes common inch fractions as fractions and other sizes as trimmed decimals", () => {
    expect(formatInchNumber(0.5)).toBe("1/2");
    expect(formatInchNumber(0.375)).toBe("3/8");
    expect(formatInchNumber(1.125)).toBe("1-1/8");
    expect(formatInchNumber(0.313)).toBe("5/16");
    expect(formatInchNumber(0.192)).toBe("0.192");
    expect(formatInchNumber(36)).toBe("36");
  });

  it("rewrites every size in a text", () => {
    expect(normalizeSizes('0.375" ID x .875 in. OD')).toBe('3/8" ID x 7/8" OD');
    expect(normalizeSizes("Long (5.6 in)")).toBe('Long (5.6")');
  });

  it("sorts across units in millimetres", () => {
    expect(sortValue(0.5, "in")).toBeCloseTo(12.7);
    expect(sortValue(8, "mm")).toBe(8);
    expect(sortValue(1, "ft")).toBeCloseTo(304.8);
    expect(sortValue(20, "DP")).toBe(20);
  });
});

describe("specs from a title", () => {
  it("reads DP, teeth and bore", () => {
    expect(show(specsFromText("Standard 20 DP Gears"))).toBe("dp:20 DP");
    expect(show(specsFromText("SDS 50 Tooth 20 DP 3/8 Hex Bore Qty. 2"))).toBe('dp:20 DP + teeth:50T + bore:3/8" Hex');
    expect(show(specsFromText("2303 Series Steel, MOD 0.8 Pinion Gear (6mm D-Bore)"))).toBe("module:MOD 0.8 + bore:6mm D");
    expect(show(specsFromText("Clamping Steel Miter Gear (8mm REX® Bore, 24 Tooth, MOD 1)"))).toBe("module:MOD 1 + teeth:24T + bore:8mm REX");
    expect(show(specsFromText("Thrifty Swerve Kraken Bore Pinion Drive Gear Kit"))).toBe("bore:Kraken Spline + motor-fit:Kraken X60");
    expect(show(specsFromText("QTY 5 - Aluminum 1/2 Inch Hex Bore Split Clamping Collar"))).toBe('bore:1/2" Hex');
  });

  it("reads REV's option texts", () => {
    expect(show(specsFromText("14T (16T C-C) - 1/2in Rounded Hex - 20DP Gear"))).toBe('dp:20 DP + teeth:14T + bore:1/2" Rounded Hex');
    expect(show(specsFromText("32T - MAXSpline - 20DP Gear"))).toBe("dp:20 DP + teeth:32T + bore:MAXSpline");
    expect(show(specsFromText("20DP Gear - 15T Spline - 18T"))).toBe("dp:20 DP + teeth:18T + bore:15T Spline");
    expect(show(specsFromText("(REV-41-1331-PK8) 15 Tooth Plastic Gear - 8 Pack"))).toBe("teeth:15T");
  });

  it("doesn't take a pair, a range, a spline or a center distance for teeth", () => {
    expect(teethFromText("WCP SwerveX Central Gear (42t/28t, Steel)")).toEqual([]);
    expect(teethFromText("15t / 45t Bevel Gear Pair Set")).toEqual([]);
    expect(teethFromText("155t-200t Belts")).toEqual([]);
    expect(show(teethFromText("2305 Series Brass, MOD 0.8, Servo Gear (25 Tooth Spline, 12 Tooth)"))).toBe("teeth:12T");
    expect(teethFromText("WCP Swerve X2t")).toEqual([]);
  });

  it("takes the module that comes first, never a fraction's numerator", () => {
    expect(show(specsFromText("17 Tooth 0.48 Module 0.125 in. Round Bore Steel Pinion Gear"))).toBe('module:MOD 0.48 + teeth:17T + bore:1/8" Round');
    expect(show(specsFromText("20 Tooth 1.5 Module 3/8 in. Hex Bore Steel Bevel Gear"))).toBe('module:MOD 1.5 + teeth:20T + bore:3/8" Hex');
  });

  it("doesn't take swerve modules for a gear module", () => {
    expect(specsFromText("Narrow Thrifty Swerve 6 Module Spares Bundle")).toEqual([]);
  });

  it("doesn't read a motor pair as a size", () => {
    expect(boreFromText("6t Steel Spur Gear (20 DP, 8t Center Distance, RS550/775 Bore)")).toEqual([]);
  });

  it("doesn't take a word's last letter or a bearing bore for a bore", () => {
    expect(boreFromText("SplineXL ID Aluminum Roller Hub (5/16-18 Tapped Bore)")).toEqual([]);
    expect(boreFromText("35 Series Bearing Bore Plate Sprockets")).toEqual([]);
  });

  it("drops a bore shape with no size", () => {
    expect(boreFromText("45t Steel Bevel Gear (1.25 Module, Round Bore)")).toEqual([]);
  });

  it("takes a pitch from a description only when it names one", () => {
    expect(show(pitchFromDescription("<p>Bevel gears are 1.25 module and do not work with …</p>"))).toBe("module:MOD 1.25");
    expect(pitchFromDescription("<p>Works with 20 DP and 32 DP gears.</p>")).toEqual([]);
    expect(pitchFromDescription(null)).toEqual([]);
  });
});

describe("variantSpecs", () => {
  const product = (title: string, categorySlug = "gears", descriptionHtml: string | null = null) => ({ title, categorySlug, descriptionHtml });

  it("fills DP from the title when the options don't give it", () => {
    const specs = variantSpecs(
      [
        { key: "bore", value: "1/2 in Hex", source: "option" },
        { key: "tooth-count", value: "14", source: "option" },
      ],
      product("Standard 20 DP Gears"),
    );
    expect(specs.map((s) => `${s.key}:${s.value}:${s.source}`)).toEqual(['bore:1/2" Hex:option', "teeth:14T:option", "dp:20 DP:title"]);
  });

  it("lets the options win over the title", () => {
    const specs = variantSpecs([{ key: "teeth", value: "18T", source: "option" }], product("16T SD Sport Planet Gear"));
    expect(show(specs)).toBe("teeth:18T");
  });

  it("reads a descriptive option and keeps it", () => {
    const specs = variantSpecs([{ key: "type", value: "14T (16T C-C) - 1/2in Rounded Hex - 20DP Gear", source: "option" }], product("20DP Gears - 1/2in Hex"));
    expect(show(specs)).toBe('type:14T (16T C-C) - 1/2in Rounded Hex - 20DP Gear + dp:20 DP + teeth:14T + bore:1/2" Rounded Hex');
  });

  it("gives a bare shape the size the title states", () => {
    expect(show(variantSpecs([{ key: "bore", value: "Hex", source: "title" }], product("3 in. Plastic Omni Wheel With 3/8 Hex Bore", "wheels")))).toBe(
      'bore:3/8" Hex + material:Plastic',
    );
  });

  it("reads a gear's pitch from its description, and nothing else's", () => {
    const html = "<p>Bevel gears are 1.25 module.</p>";
    expect(show(variantSpecs([], product("Thrifty Swerve Bevel Gear Kit", "gears", html)))).toBe("module:MOD 1.25");
    expect(show(variantSpecs([], product("Thrifty Swerve Bevel Gear Kit", "drivetrain", html)))).toBe("");
  });

  it("adds the material the title names", () => {
    expect(show(variantSpecs([], product("WCP Swerve X2 Drive Double Gear (54t/38t, Aluminum)")))).toBe("material:Aluminum");
  });
});
