import { describe, expect, it } from "vitest";
import { CATEGORY_GROUPS, groupCategories, groupOfCategory } from "./category-groups";

const ALL = ["bearings", "belts-chain", "drivetrain", "electronics", "fasteners", "gearboxes", "gears", "mechanisms", "motors", "other", "pneumatics", "sensors", "shafts", "structure", "tools", "wheels"];

describe("category groups", () => {
  it("puts every category in exactly one group", () => {
    const mapped = CATEGORY_GROUPS.flatMap((g) => [...g.slugs]);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...mapped].sort()).toEqual(ALL);
  });

  it("sends an unmapped slug to כלים ושונות", () => {
    expect(groupOfCategory("brand-new")).toBe("misc");
    expect(groupOfCategory("motors")).toBe("electrical");
  });

  it("sums counts and keeps unmapped categories", () => {
    const groups = groupCategories([
      { slug: "motors", count: 3 },
      { slug: "sensors", count: 2 },
      { slug: "new-thing", count: 4 },
    ]);
    expect(groups.map((g) => [g.id, g.count])).toEqual([["electrical", 5], ["misc", 4]]);
  });
});
