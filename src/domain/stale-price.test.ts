import { describe, expect, it } from "vitest";
import { allStale, isStale, someStale } from "./stale-price";

describe("stale prices", () => {
  const stale = ["rev", "gobilda"];
  it("knows a stale supplier", () => {
    expect(isStale("rev", stale)).toBe(true);
    expect(isStale("wcp", stale)).toBe(false);
    expect(isStale(null, stale)).toBe(false);
  });
  it("hides a card only when every supplier on it is stale", () => {
    expect(allStale(["rev"], stale)).toBe(true);
    expect(allStale(["rev", "gobilda"], stale)).toBe(true);
    expect(allStale(["rev", "wcp"], stale)).toBe(false);
    expect(allStale([], stale)).toBe(false);
    expect(allStale(["rev"], [])).toBe(false);
  });
  it("tells a mixed card from a wholly stale one", () => {
    expect(someStale(["rev", "wcp"], stale)).toBe(true);
    expect(someStale(["rev"], stale)).toBe(false);
    expect(someStale(["wcp"], stale)).toBe(false);
  });
});
