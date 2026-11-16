import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORY_GROUPS, groupCategories, groupOf, groupSpans, moveId, newGroupId } from "./category-groups";

const ALL = ["bearings", "belts-chain", "drivetrain", "electronics", "fasteners", "gearboxes", "gears", "mechanisms", "motors", "other", "pneumatics", "sensors", "shafts", "structure", "tools", "wheels"];
const GROUPS = DEFAULT_CATEGORY_GROUPS.map(({ id, name }) => ({ id, name }));

describe("category groups", () => {
  it("seeds every category in exactly one group", () => {
    const mapped = DEFAULT_CATEGORY_GROUPS.flatMap((g) => [...g.slugs]);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...mapped].sort()).toEqual(ALL);
  });

  it("sends a category of a removed group to the last group", () => {
    expect(groupOf("gone", GROUPS)).toBe("misc");
    expect(groupOf("electrical", GROUPS)).toBe("electrical");
    expect(groupOf("x", [])).toBeNull();
  });

  it("follows the admin's group order, sums counts, and sends a lost group to the last one", () => {
    const groups = groupCategories(
      [
        { slug: "motors", group: "electrical", count: 3 },
        { slug: "sensors", group: "electrical", count: 2 },
        { slug: "new-thing", group: "deleted", count: 4 },
        { slug: "tools", group: "misc", count: 1 },
      ],
      [GROUPS[4], GROUPS[0]],
    );
    expect(groups.map((g) => [g.id, g.count])).toEqual([["misc", 1], ["electrical", 9]]);
  });

  it("moves an id and stops at the ends", () => {
    expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a"], "z", 1)).toEqual(["a"]);
  });

  it("makes a unique id", () => {
    expect(newGroupId(["g2", "a"])).toBe("g3");
    expect(newGroupId(["g1"])).toBe("g2");
  });
});

describe("groupSpans", () => {
  it("lays out two wide cards, then thirds", () => {
    expect(groupSpans(5)).toEqual([3, 3, 2, 2, 2]);
    expect(groupSpans(8)).toEqual([3, 3, 2, 2, 2, 2, 2, 2]);
  });
  it("closes every row without a gap", () => {
    expect(groupSpans(4)).toEqual([3, 3, 3, 3]);
    expect(groupSpans(6)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(groupSpans(3)).toEqual([3, 3, 6]);
    expect(groupSpans(7)).toEqual([3, 3, 2, 2, 2, 3, 3]);
    for (let n = 1; n <= 12; n++) expect(groupSpans(n).reduce((a, b) => a + b, 0) % 6).toBe(0);
  });
  it("handles one or none", () => {
    expect(groupSpans(1)).toEqual([6]);
    expect(groupSpans(0)).toEqual([]);
  });
});
