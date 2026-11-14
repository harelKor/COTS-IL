import { describe, expect, it } from "vitest";
import { countOf, ITEM, ORDER, UNIT, units } from "./plural";

describe("countOf", () => {
  it("says one in words, after the singular noun, in its gender", () => {
    expect(countOf(1, ITEM)).toBe("פריט אחד");
    expect(countOf(1, ORDER)).toBe("הזמנה אחת");
    expect(countOf(1, UNIT)).toBe("יחידה אחת");
  });

  it("puts any other number before the plural", () => {
    expect(countOf(2, ITEM)).toBe("2 פריטים");
    expect(countOf(0, ITEM)).toBe("0 פריטים");
    expect(countOf(1250, ORDER)).toBe("1,250 הזמנות");
  });

  it("keeps the digit for one in the compact form (A-04)", () => {
    expect(countOf(1, ITEM, "compact")).toBe("1 פריט");
    expect(countOf(3, ITEM, "compact")).toBe("3 פריטים");
  });
});

describe("units", () => {
  it("is the short form for any number", () => {
    expect(units(1)).toBe("1 יח׳");
    expect(units(2)).toBe("2 יח׳");
    expect(`${countOf(1, ITEM, "compact")}, ${units(2)}`).toBe("1 פריט, 2 יח׳");
  });
});
