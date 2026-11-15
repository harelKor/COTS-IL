import { describe, expect, it } from "vitest";
import { loopCards, suggestionRow } from "./suggestions";

const c = (id: string) => ({ id });

describe("suggestionRow", () => {
  it("keeps the fitting title when enough parts fit", () => {
    const row = suggestionRow("self", [c("a"), c("b"), c("c"), c("d"), c("self")], [c("x")], [c("y")]);
    expect(row.title).toBe("מתאים לשימוש עם");
    expect(row.cards.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("fills a short fitting list from the category and the vendor, each part once", () => {
    const row = suggestionRow("self", [c("a")], [c("a"), c("x"), c("self")], [c("x"), c("y")]);
    expect(row.title).toBe("מתאים ומשלים");
    expect(row.cards.map((x) => x.id)).toEqual(["a", "x", "y"]);
  });

  it("never says the parts fit when none do", () => {
    const row = suggestionRow("self", [], [c("x")], [c("y")]);
    expect(row.title).toBe("חלקים שכדאי להכיר");
    expect(row.cards.map((x) => x.id)).toEqual(["x", "y"]);
  });

  it("stops at twelve cards", () => {
    const many = Array.from({ length: 20 }, (_, i) => c(`p${i}`));
    expect(suggestionRow("self", [], many, []).cards).toHaveLength(12);
  });
});

describe("loopCards", () => {
  it("repeats a short list until one copy is long enough", () => {
    expect(loopCards([1, 2, 3])).toEqual({ base: [1, 2, 3, 1, 2, 3, 1, 2, 3], loops: true });
  });

  it("leaves a list of one or two still", () => {
    expect(loopCards([1, 2])).toEqual({ base: [1, 2], loops: false });
  });

  it("keeps a long list as it is", () => {
    const list = Array.from({ length: 10 }, (_, i) => i);
    expect(loopCards(list).base).toEqual(list);
  });
});
