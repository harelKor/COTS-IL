import { describe, expect, it } from "vitest";
import { parseFilters } from "@/lib/catalog-filters";
import { crumbTrail, droppedText, groupMembers, keepsSpecs, moveTo } from "./catalog-nav";

const groups = [
  { id: "motion", name: "הנעה ותמסורת" },
  { id: "structure", name: "מבנה וחומרה" },
];
const categories = [
  { slug: "gears", name: "גלגלי שיניים", group: "motion" },
  { slug: "belts-chain", name: "רצועות ושרשראות", group: "motion" },
  { slug: "bearings", name: "מסבים", group: "structure" },
  // A category whose group was removed falls into the last group.
  { slug: "other", name: "שונות", group: "gone" },
];

describe("moving between scopes (CF3)", () => {
  const filtered = parseFilters({ category: "gears", group: "motion", "s.dp": "20 DP", "s.teeth": "20-40", supplier: ["wcp", "andymark"], program: "FRC", available: "1", price: "10-90", q: "pinion", sort: "price-asc" });

  it("keeps a category's spec filters only inside it", () => {
    expect(keepsSpecs({ group: "motion", category: "gears" }, { group: "motion", category: "gears" })).toBe(true);
    expect(keepsSpecs({ group: "motion", category: "gears" }, { group: "motion", category: "belts-chain" })).toBe(false);
    expect(keepsSpecs({ group: "motion", category: "gears" }, { group: "motion", category: "" })).toBe(false);
    expect(keepsSpecs({ group: "motion", category: "gears" }, { group: "", category: "" })).toBe(false);
  });

  it("keeps a search's spec filters when the scope narrows", () => {
    expect(keepsSpecs({ group: "", category: "" }, { group: "motion", category: "gears" })).toBe(true);
    expect(keepsSpecs({ group: "motion", category: "" }, { group: "motion", category: "gears" })).toBe(true);
    expect(keepsSpecs({ group: "motion", category: "" }, { group: "structure", category: "" })).toBe(false);
  });

  it("drops the specs and ranges and keeps everything else when it leaves the category", () => {
    const { filters, dropped } = moveTo(filtered, { group: "structure" });
    expect(dropped).toBe(true);
    expect(filters).toMatchObject({ group: "structure", category: "", specs: {}, ranges: {}, suppliers: ["wcp", "andymark"], program: "FRC", availableOnly: true, price: { min: 10, max: 90 }, q: "pinion", sort: "price-asc", page: 1 });
  });

  it("says nothing was dropped when there was nothing to drop, or it stays", () => {
    expect(moveTo(parseFilters({ category: "gears" }), { group: "structure" }).dropped).toBe(false);
    const same = moveTo(filtered, { group: "motion", category: "gears" });
    expect(same.dropped).toBe(false);
    expect(same.filters.specs).toEqual({ dp: ["20 DP"] });
    expect(same.filters.ranges).toEqual({ teeth: { min: 20, max: 40 } });
  });

  it("names the scope that was left", () => {
    expect(droppedText("גלגלי שיניים")).toBe("הסינונים של גלגלי שיניים הוסרו");
    expect(droppedText(null)).toBe("סינוני המפרט הוסרו");
  });
});

describe("the breadcrumb and the group's categories", () => {
  it("runs from the catalog through the group to the category", () => {
    expect(crumbTrail({ group: "", category: "gears" }, categories, groups)).toEqual([
      { name: "קטלוג", to: { group: "", category: "" } },
      { name: "הנעה ותמסורת", to: { group: "motion", category: "" } },
      { name: "גלגלי שיניים", to: { group: "motion", category: "gears" } },
    ]);
    expect(crumbTrail({ group: "structure", category: "" }, categories, groups).map((c) => c.name)).toEqual(["קטלוג", "מבנה וחומרה"]);
    expect(crumbTrail({ group: "", category: "" }, categories, groups).map((c) => c.name)).toEqual(["קטלוג"]);
    // An unknown group or category is the catalog.
    expect(crumbTrail({ group: "nope", category: "nope" }, categories, groups)).toHaveLength(1);
  });

  it("puts a category in its group even when the URL names another or none", () => {
    expect(crumbTrail({ group: "structure", category: "gears" }, categories, groups)[1].name).toBe("הנעה ותמסורת");
    expect(crumbTrail({ group: "", category: "other" }, categories, groups)[1].name).toBe("מבנה וחומרה");
  });

  it("lists the group's categories for its tiles and a category's siblings", () => {
    expect(groupMembers({ group: "motion", category: "" }, categories, groups).map((c) => c.slug)).toEqual(["gears", "belts-chain"]);
    expect(groupMembers({ group: "", category: "bearings" }, categories, groups).map((c) => c.slug)).toEqual(["bearings", "other"]);
    expect(groupMembers({ group: "", category: "" }, categories, groups)).toEqual([]);
  });
});
