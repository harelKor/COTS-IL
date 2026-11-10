import { describe, expect, it } from "vitest";
import { categorize, programsFor, statusFor } from "./classify";

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
