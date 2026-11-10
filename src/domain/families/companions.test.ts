import { describe, expect, it } from "vitest";
import { companionRules } from "./companions";

describe("companionRules", () => {
  it("suggests bearings and shafts that fit a gear's bore", () => {
    expect(companionRules({ categorySlug: "gears", title: "Steel Spur Gear (20 DP)", options: { teeth: "36t", bore: '1/2" Hex' } })).toEqual([
      { category: "bearings", terms: ['1/2" hex'] },
      { category: "shafts", terms: ['1/2" hex'] },
    ]);
  });

  it("matches belts and pulleys by pitch and width", () => {
    expect(companionRules({ categorySlug: "belts-chain", title: "Timing Belt (HTD 5mm)", options: { teeth: "100t", width: "9mm" } })).toEqual([
      { category: "belts-chain", terms: ["pulley", "htd", "9mm"] },
    ]);
    expect(
      companionRules({ categorySlug: "belts-chain", title: "Aluminum Pulley (GT2 3mm)", options: { teeth: "16t", width: "9mm", bore: "8mm SplineXS" } })[0],
    ).toEqual({ category: "belts-chain", terms: ["belt", "gt2", "9mm"], without: ["pulley"] });
  });

  it("offers chain for a sprocket", () => {
    expect(companionRules({ categorySlug: "belts-chain", title: "Aluminum Double Hub Sprocket (#25 Chain)", options: { teeth: "18t" } })).toContainEqual({
      category: "belts-chain",
      terms: ["#25", "chain"],
      without: ["sprocket"],
    });
  });

  it("offers shafts for a hex bearing, and bearings for hex stock", () => {
    expect(companionRules({ categorySlug: "bearings", title: "Flanged Bearing", options: { id: '3/8" Hex' } })).toEqual([
      { category: "shafts", terms: ['3/8" hex'] },
    ]);
    expect(companionRules({ categorySlug: "shafts", title: 'Hex Stock (1/2" Hex)', options: {} })).toEqual([{ category: "bearings", terms: ['1/2" hex'] }]);
  });

  it("has nothing to suggest for an unrelated part", () => {
    expect(companionRules({ categorySlug: "electronics", title: "Breaker Panel", options: {} })).toEqual([]);
  });
});

describe("companionRules beyond gears", () => {
  it("suggests a motor's spacers, mounts and wiring", () => {
    const rules = companionRules({ categorySlug: "motors", title: "Kraken X60 Powered by TalonFX", options: {} });
    expect(rules.map((r) => r.category)).toEqual(["motors", "gearboxes", "electronics"]);
    expect(rules[0].terms).toEqual(["kraken x60"]);
  });
  it("suggests wheels and gears for a swerve module", () => {
    const rules = companionRules({ categorySlug: "drivetrain", title: "WCP Swerve X2St Base Kit", options: {} });
    expect(rules.map((r) => r.category)).toEqual(["drivetrain", "gears", "motors"]);
  });
  it("suggests wire and connectors for a motor controller", () => {
    const rules = companionRules({ categorySlug: "electronics", title: "Thrifty Nova Motor Controller", options: {} });
    expect(rules.map((r) => r.terms[0])).toEqual(["wire", "connector"]);
  });
});
