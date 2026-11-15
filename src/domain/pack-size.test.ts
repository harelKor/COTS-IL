import { describe, expect, it } from "vitest";
import { packSize, packText } from "./pack-size";

describe("packSize", () => {
  it.each([
    ["14-16 AWG Blue Female Connector Qty. 10", 10],
    ["QTY 5 - Aluminum 1/2 Inch Hex Bore Split Clamping Collar", 5],
    ["Qty: 4 Hex Bearing", 4],
    ["5 Slot Clear Wire Lever Nut (10-Pack)", 10],
    ["2mm Key (5-pack)", 5],
    ["Barb for Polyurethane Hollow Belt - 8 Pack", 8],
    ["Thermal Sticker 5 Pack", 5],
    ["30cm x 30cm Microfiber Towel with WCP/Corgi Logo (600gsm, 2-Pack)", 2],
    ["1137 Series Steel Flat Grid Bracket (1-2) - 2 Pack", 2],
    ['10" Black Ziptie (.140" Width) (100-Pack)', 100],
    ["Rubber Bands, Pack of 25", 25],
    ["Zip Ties 50pk", 50],
    ["MK ES17-12 Battery (2-Pack)", 2],
  ])("%s → %d", (title, n) => {
    expect(packSize(title)).toBe(n);
  });

  it.each([
    "QTY 1 - 11 Tooth HTD 8mm Keyed Motor Output Pulley",
    "GripForce™ Mecanum Wheel Roller Pack (40A)",
    "Spur Gear Starter Pack (MOD 0.8, 8mm REX® Bore)",
    "Hex-Plus Multicolour L-key Set (Metric, 9 Pieces)",
    "Battery Pack",
    "20 DP Aluminum Spur Gear",
    "Kraken X60 Powered by TalonFX",
  ])("never guesses: %s", (title) => {
    expect(packSize(title)).toBeNull();
  });

  it("words it in Hebrew", () => {
    expect(packText(10)).toBe("חבילה של 10");
    expect(packText(1000)).toBe("חבילה של 1,000");
  });
});
