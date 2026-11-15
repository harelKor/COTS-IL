import { describe, expect, it } from "vitest";
import { normalizeFilterValue, normalizeSpec } from "./normalize";

/**
 * Every spelling seen at a supplier, and the one value it becomes. A new supplier's
 * spelling gets a row here with its row in spec-aliases.ts. The last column is what a
 * filter lists, joined with " + " when one text gives several specs.
 */
const FIXTURES: [key: string, raw: string, expected: string][] = [
  // Bore: inch sizes in one form, 0.5" = 1/2"
  ["bore", '1/2" Hex', 'bore:1/2" Hex'],
  ["bore", "1/2 in. Hex", 'bore:1/2" Hex'],
  ["bore", "1/2 in Hex", 'bore:1/2" Hex'],
  ["bore", "1/2 Hex", 'bore:1/2" Hex'],
  ["bore", '0.5" Hex', 'bore:1/2" Hex'],
  ["bore", "0.500 in. Hex", 'bore:1/2" Hex'],
  ["bore", "0.5 in. Hex Bore", 'bore:1/2" Hex'],
  ["bore", "500 Hex", 'bore:1/2" Hex'],
  ["bore", '3/8" Hex', 'bore:3/8" Hex'],
  ["bore", "3/8 in. Hex", 'bore:3/8" Hex'],
  ["bore", "0.375 in. Hex Bore", 'bore:3/8" Hex'],
  ["bore", "375 Hex", 'bore:3/8" Hex'],
  ["bore", "3/8 Hex (0.625 OD)", 'bore:3/8" Hex'],
  ["bore", '1/2" Rounded Hex', 'bore:1/2" Rounded Hex'],
  ["bore", "1/2in Thunderhex", 'bore:1/2" Rounded Hex'],
  // Round bores, and a size with no shape
  ["bore", '0.125" Round', 'bore:1/8" Round'],
  ["bore", "1/8 in. Round", 'bore:1/8" Round'],
  ["bore", '1/8"', 'bore:1/8" Round'],
  ["bore", ".875", 'bore:7/8" Round'],
  ["bore", "1.125 in. Bearing Bore", 'bore:1-1/8" Round'],
  ["bore", '1/2"', 'bore:1/2"'],
  ["bore", '3/8"', 'bore:3/8"'],
  // Metric stays metric
  ["bore", "8mm", "bore:8mm Round"],
  ["bore", "8 mm Round", "bore:8mm Round"],
  ["bore", "8mm Round", "bore:8mm Round"],
  ["bore", "14 mm Hex", "bore:14mm Hex"],
  ["bore", "7mm Hex (8mm Compatible)", "bore:7mm Hex"],
  ["bore", "8 mm Key", "bore:8mm Keyed"],
  ["bore", "8mm Key", "bore:8mm Keyed"],
  ["bore", "8 mm Round with Key", "bore:8mm Keyed"],
  ["bore", "6mm D-Bore", "bore:6mm D"],
  ["bore", "8mm REX® Bore", "bore:8mm REX"],
  // Named splines
  ["bore", "8mm SplineXS", "bore:SplineXS"],
  ["bore", "SplineXL", "bore:SplineXL"],
  ["bore", "MAXSpline", "bore:MAXSpline"],
  ["bore", "15T 8mm Spline", "bore:15T Spline"],
  ["bore", "24T Servo Spline", "bore:24T Servo Spline"],
  ["bore", "Falcon", "bore:Falcon Spline + motor-fit:Falcon 500"],
  ["bore", "Falcon Spline with Counterbore", "bore:Falcon Spline + motor-fit:Falcon 500"],
  ["bore", "Kraken", "bore:Kraken Spline + motor-fit:Kraken X60"],
  ["bore", "Kraken Spline", "bore:Kraken Spline + motor-fit:Kraken X60"],
  // Motors used as a bore: only the motor
  ["bore", "RS775", "motor-fit:RS775"],
  ["bore", "RS550", "motor-fit:RS550"],
  ["bore", "RS550/775", "motor-fit:RS550 + motor-fit:RS775"],
  ["bore", "BAG", "motor-fit:BAG"],
  ["bore", "CIM", "motor-fit:CIM"],
  ["bore", "MiniCIM", "motor-fit:MiniCIM"],
  ["bore", "775pro", "motor-fit:775pro"],
  ["bore", "NEO", "motor-fit:NEO"],
  // Bore words that aren't a size
  ["bore", "Blank", "bore:Blank"],
  ["bore", "Nub Bore", "bore:Nub"],
  ["bore", "Bearing Bore", ""],
  ["bore", "Universal Pulley Extension", ""],
  ["bore", "Hex", ""],
  ["bore", "Round", ""],
  // Option names that are a bore (and a motor)
  ["bore-size", '0.159" Round', 'bore:0.159" Round'],
  ["motor-pinion-type", "NEO 8mm Key", "bore:8mm Keyed + motor-fit:NEO"],
  ["motor-pinion-type", "NEO Vortex 8mm Key", "bore:8mm Keyed + motor-fit:NEO Vortex"],
  ["motor-pinion-type", "Kraken / NEO 2.0", "bore:Kraken Spline + motor-fit:Kraken X60 + motor-fit:NEO"],
  ["motor-hardware", "Flacon Spline", "bore:Falcon Spline + motor-fit:Falcon 500"],
  ["motor-input-hardware", "550 and 775", "motor-fit:RS550 + motor-fit:RS775"],
  ["motor-input-hardware", "Dual 775", "motor-fit:RS775"],
  // AndyMark's "Motor" option
  ["motor", "775 & 550", "motor-fit:RS775 + motor-fit:RS550"],
  ["motor", "CIM/NEO", "motor-fit:CIM + motor-fit:NEO"],
  ["motor", "NEO 550", "motor-fit:NEO 550"],
  ["motor", "Kraken X44", "motor-fit:Kraken X44"],
  ["motor", "Kraken/Minion", "motor-fit:Kraken X60 + motor-fit:Minion"],
  ["motor", "Motor Included", ""],
  // Teeth: a whole number, shown as 12T
  ["teeth", "12", "teeth:12T"],
  ["teeth", "12t", "teeth:12T"],
  ["teeth", "12T", "teeth:12T"],
  ["teeth", "24 Tooth", "teeth:24T"],
  ["teeth", "40 - Black", "teeth:40T"],
  ["teeth", '10 Tooth 1/2" Hex Bore', 'teeth:10T + bore:1/2" Hex'],
  ["teeth", "7 Tooth 8mm Keyed Bore", "teeth:7T + bore:8mm Keyed"],
  ["tooth-count", "100T", "teeth:100T"],
  ["number-of-teeth", "56", "teeth:56T"],
  ["belt-size", "225t", "teeth:225T"],
  ["cd", "16t", "cd:16T"],
  // DP and module
  ["dp", "20 DP", "dp:20 DP"],
  ["dp", "20DP", "dp:20 DP"],
  ["tooth-profile", "20 DP, 14.5° PA", "dp:20 DP"],
  ["tooth-profile", "0.6 MOD, 20° PA", "module:MOD 0.6"],
  ["dp", "1.5 Module", "module:MOD 1.5"],
  // Pitch
  ["pitch", "#25 Chain", "pitch:#25 Chain"],
  ["chain-size", "#25 Series", "pitch:#25 Chain"],
  ["chain-size", "#35", "pitch:#35 Chain"],
  ["pitch", "GT2 3mm", "pitch:GT2 3mm"],
  ["pitch", "HTD 5mm", "pitch:HTD 5mm"],
  ["pitch", "1/2 in.", 'pitch:1/2"'],
  // Widths, lengths and diameters: one form, fractions stay fractions
  ["width", '.375"', 'width:3/8"'],
  ["width", '0.500"', 'width:1/2"'],
  ["width", '.188"', 'width:3/16"'],
  ["width", '1-1/2"', 'width:1-1/2"'],
  ["width", "9 mm", "width:9mm"],
  ["length", "36 in.", 'length:36"'],
  ["length", "36 inches", 'length:36"'],
  ["length", "12in", 'length:12"'],
  ["length", "1 ft.", "length:1 ft"],
  ["length", "10 feet", "length:10 ft"],
  ["length", "12cm", "length:120mm"],
  ["length", "(REV-21-2004-PK10) 1/2in Hex Shaft Spacer - 1/8in - 10 Pack", 'length:1/8"'],
  ["length", "(REV-21-2062-PK4) #10-32 Standoff - 3/8in Hex - 0.75in - 4 Pack", 'length:3/4"'],
  ["length", "(REV-21-1135) 1/2in Rounded Hex Shaft - 36.0in (not tapped)", 'length:36"'],
  ["length", '36" Long Aluminum Extrusion', 'length:36"'],
  ["id", '0.192"', 'id:0.192"'],
  ["id", '.500" Hex', 'id:1/2" Hex'],
  ["od", '1.125"', 'od:1-1/8"'],
  ["inner-diameter", "8 mm", "id:8mm"],
  // Material
  ["material", "Brass with nickel plating", "material:Brass"],
  ["material", "1000 Denier Nylon (Cordura)", "material:Nylon"],
];

const show = (key: string, raw: string) =>
  normalizeSpec(key, raw)
    .map((s) => `${s.key}:${s.value}`)
    .join(" + ");

describe("spec aliases", () => {
  it.each(FIXTURES)("%s %j", (key, raw, expected) => {
    expect(show(key, raw)).toBe(expected);
  });

  it("leaves a stored value as it is, so a filter link reads back the same", () => {
    for (const [, , expected] of FIXTURES) {
      for (const part of expected ? expected.split(" + ") : []) {
        const at = part.indexOf(":");
        const [key, value] = [part.slice(0, at), part.slice(at + 1)];
        expect(normalizeFilterValue(key, value)).toEqual({ key, value });
      }
    }
  });

  it("merges every old spelling of one bore into one value", () => {
    const values = ['1/2" Hex', "1/2 in. Hex", "1/2 in Hex", '0.5" Hex', "0.500 in. Hex", "1/2 Hex"].map((v) => show("bore", v));
    expect(new Set(values)).toEqual(new Set(['bore:1/2" Hex']));
  });

  it("keeps a sort number on sizes and teeth", () => {
    expect(normalizeSpec("bore", "0.375 in. Hex")[0]).toMatchObject({ num: 0.375, unit: "in" });
    expect(normalizeSpec("bore", "8 mm Key")[0]).toMatchObject({ num: 8, unit: "mm" });
    expect(normalizeSpec("teeth", "48t")[0]).toMatchObject({ num: 48, unit: "T" });
    expect(normalizeSpec("dp", "20DP")[0]).toMatchObject({ num: 20, unit: "DP" });
  });
});

describe("normalizeFilterValue", () => {
  it("reads an old link's spelling as the stored one", () => {
    expect(normalizeFilterValue("bore", "1/2 in. Hex")).toEqual({ key: "bore", value: '1/2" Hex' });
    expect(normalizeFilterValue("teeth", "12t")).toEqual({ key: "teeth", value: "12T" });
  });

  it("moves a motor filed under bore to the motor filter", () => {
    expect(normalizeFilterValue("bore", "RS775")).toEqual({ key: "motor-fit", value: "RS775" });
  });

  it("keeps a value it can't read", () => {
    expect(normalizeFilterValue("bore", "Hex")).toEqual({ key: "bore", value: "Hex" });
    expect(normalizeFilterValue("ratio", "10:1")).toEqual({ key: "ratio", value: "10:1" });
  });
});
