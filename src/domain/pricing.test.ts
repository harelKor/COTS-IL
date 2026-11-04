import { describe, expect, it } from "vitest";
import { priceIls } from "./pricing";

describe("priceIls", () => {
  it("multiplies by 1.6 and rounds to whole shekels", () => {
    expect(priceIls("100.00")).toBe(160);
    expect(priceIls("19.99")).toBe(32);
    expect(priceIls(0.5)).toBe(1);
  });

  it("never rounds a cheap part down to zero", () => {
    expect(priceIls("0.25")).toBe(1);
  });

  it("uses a custom multiplier", () => {
    expect(priceIls(100, 2)).toBe(200);
  });

  it("returns null when there is no usable price", () => {
    for (const usd of [null, undefined, "0.00", 0, -5, "abc"]) expect(priceIls(usd)).toBeNull();
  });
});
