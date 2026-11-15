import { describe, expect, it } from "vitest";
import { foldText, matchList } from "./list-search";

describe("list search", () => {
  it("folds case and spaces", () => {
    expect(foldText('  1/2"   HEX ')).toBe('1/2" hex');
  });

  it("keeps the items whose text holds the search, all of them for none", () => {
    const items = ['1/2" Hex', '3/8" Hex', "8mm Round"];
    expect(matchList(items, "hex", (s) => s)).toEqual(['1/2" Hex', '3/8" Hex']);
    expect(matchList(items, "  ", (s) => s)).toEqual(items);
  });
});
