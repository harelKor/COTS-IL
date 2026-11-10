import { describe, expect, it } from "vitest";
import { hasUsdPrice, priceIls } from "./pricing";

describe("priceIls", () => {
  it("is USD × rate, rounded to whole shekels", () => {
    expect(priceIls("100.00", 3.5)).toBe(350);
    expect(priceIls("19.99", 3.171)).toBe(63);
    // Kraken X44 at the Nov 9, 2026 Bank of Israel rate.
    expect(priceIls("217.99", 3.171)).toBe(691);
  });

  it("never rounds a cheap part down to zero", () => {
    expect(priceIls("0.10", 3.171)).toBe(1);
  });

  it("uses a custom markup", () => {
    expect(priceIls(100, 3, 2)).toBe(600);
  });

  it("returns null when there is no usable price", () => {
    for (const usd of [null, undefined, "0.00", 0, -5, "abc"]) expect(priceIls(usd, 3.5)).toBeNull();
  });

  it("refuses to price at a missing or zero rate", () => {
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => priceIls("10", rate)).toThrow();
  });
});

describe("hasUsdPrice", () => {
  it("accepts only positive numbers", () => {
    expect(hasUsdPrice("1.00")).toBe(true);
    for (const usd of [null, undefined, "0", "x", -1]) expect(hasUsdPrice(usd)).toBe(false);
  });
});
