import { describe, expect, it } from "vitest";
import { categorize, categorizeByTitleFirst, categorizeShopify, programsFor, statusFor } from "./classify";

const product = (title: string, productType: string | null = null, tags: string[] = []) => ({
  title,
  productType,
  tags,
});

describe("categorize", () => {
  it.each([
    ["ToughBox Mini S", "gearboxes"],
    ["Kraken X60 Spur Gear", "gears"],
    ["14T Hex Bore Gear", "gears"],
    ["18 mm Wide 5 mm Pitch 25 ft Long HTD Timing Belt", "belts-chain"],
    ["SDS MK4i Swerve Modules", "drivetrain"],
    ["Kraken X60 Motor", "motors"],
    ["Thrifty CAN Wire 2.0", "electronics"],
    ["CANcoder", "sensors"],
    ['QTY 10 - Oversized 36 Inch Long 1/2" Rounded Hex Shaft', "shafts"],
    ["1.25 x 0.1875 Steel Dowel Pin", "shafts"],
    ["Deburring Tools", "tools"],
    ["Mystery Widget", "other"],
    ["MAXTube - 2x1", "structure"],
    ["15mm Pillow Blocks", "bearings"],
    ["MAXSpline Pillow Block", "bearings"],
    ["1121 Series Low-Side U-Channel (16 Hole, 408mm Length)", "structure"],
    ["Yellow Jacket Planetary Gear Motor (19.2:1 Ratio)", "gearboxes"],
    ["XT30 Adapters", "electronics"],
    ["4007 Series Hyper Coupler (6mm D-Bore to 8mm REX Bore)", "shafts"],
    ["Steel Viper-Slide (10-Ball Carriage, 240mm Length, 174mm Travel)", "mechanisms"],
    ["2313 Series Stainless Steel, MOD 1.25 Worm (6mm D-Bore, 34mm Length)", "gears"],
    ["Micro Limit Switch (Bump Lever) - 2 Pack", "sensors"],
    ["48mm Grid-Track (24mm Pitch, 48mm Width) - 6 Pack", "wheels"],
  ])("%s → %s", (title, slug) => {
    expect(categorize(product(title))).toBe(slug);
  });

  it("reads the product type and tags as well as the title", () => {
    expect(categorize(product("Widget", "Bearings"))).toBe("bearings");
    expect(categorize(product("Widget", null, ["Spacers"]))).toBe("shafts");
  });
});

describe("programsFor", () => {
  it("uses what the listing says, limited to the supplier's programs", () => {
    expect(programsFor(product("Kit", "FIRST® Tech Challenge Bundles"), ["FRC", "FTC"])).toEqual(["FTC"]);
    expect(programsFor(product("FTC Kit"), ["FRC"])).toEqual(["FRC"]);
  });

  it("falls back to the supplier's programs", () => {
    expect(programsFor(product("Bearing"), ["FRC", "FTC"])).toEqual(["FRC", "FTC"]);
  });
});

describe("statusFor", () => {
  it("hides discontinued, FLL and gift card products", () => {
    expect(statusFor(product("Old", null, ["Discontinued"]), true)).toBe("hidden");
    expect(statusFor(product("Set", "FIRST® LEGO League"), true)).toBe("hidden");
    expect(statusFor(product("Gift Card"), true)).toBe("hidden");
    expect(statusFor(product("Ships from Sydney - Battery Beak"), true)).toBe("hidden");
  });

  it("sends unpriced products to review", () => {
    expect(statusFor(product("Bearing"), false)).toBe("review");
    expect(statusFor(product("Bearing"), true)).toBe("published");
  });
});

describe("categorizeByTitleFirst", () => {
  it("doesn't let a breadcrumb like Hardware & Tools outweigh the title", () => {
    expect(categorizeByTitleFirst(product("M3 Stainless Steel Washer - 100 Pack", "Fasteners", ["Hardware & Tools", "Fasteners"]))).toBe("fasteners");
    expect(categorize(product("M3 Stainless Steel Washer - 100 Pack", "Fasteners", ["Hardware & Tools", "Fasteners"]))).toBe("tools");
  });
  it("falls back to the whole trail", () => {
    expect(categorizeByTitleFirst(product("Widget", "Kits", ["Bearings", "Kits"]))).toBe("bearings");
  });
});

describe("categorizeShopify", () => {
  const stealth = product("Stealth and Sushi Wheels", "Compliant & Intake", ["All FTC Parts", "Robits Wheels", "Traction Wheels"]);
  it("puts a wheel the vendor filed under intakes with the wheels", () => {
    expect(categorize(stealth)).toBe("mechanisms");
    expect(categorizeShopify(stealth)).toBe("wheels");
    expect(categorizeShopify(product("Polycarb Round Tubing", null, ["Intake"]))).toBe("structure");
  });
  it("keeps the vendor's type and tags everywhere else", () => {
    // Title first would read "wire" (electronics) or "Kraken" (motors).
    expect(categorizeShopify(product("8-22 AWG Wire Stripper", "Tools"))).toBe("tools");
    expect(categorizeShopify(product("WCP Kraken X60 Wrist Band", null, ["Merch"]))).toBe("other");
  });
  it("keeps a mechanism whose title only names a size or a bolt pattern", () => {
    expect(categorizeShopify(product("WCP Friction Brake (1/2\" Hex)", null, ["Intake"]))).toBe("mechanisms");
    expect(categorizeShopify(product("WCP Friction Brake Pad – 2 Inch Bolt Pattern", null, ["Climber"]))).toBe("mechanisms");
  });
});
