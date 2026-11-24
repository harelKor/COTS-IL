import { describe, expect, it } from "vitest";
import { commonDiscount, discountedUsd, discountLabels, formatIls, hasUsdPrice, partDiscount, priceIls, resolveDiscount, resolveMarkup, roundIls, vatLabel, vatSplit, type PriceContext, type PricingRuleSet } from "./pricing";

const at = (rate: number, more: Partial<PriceContext> = {}): PriceContext => ({ rate, markup: 1.6, roundTo: 1, minIls: null, ...more });

describe("priceIls", () => {
  it("is USD × rate × 1.6, rounded to whole shekels", () => {
    expect(priceIls("100.00", at(3.5))).toBe(560);
    expect(priceIls("19.99", at(3.171))).toBe(101);
    // Kraken X44 at the Nov 9, 2026 Bank of Israel rate.
    expect(priceIls("217.99", at(3.171))).toBe(1106);
  });

  it("never rounds a cheap part down to zero", () => {
    expect(priceIls("0.10", at(3.171))).toBe(1);
  });

  it("uses the part's own multiplier, else the global one", () => {
    expect(priceIls(100, at(3), 2)).toBe(600);
    expect(priceIls(100, at(3), "1.250")).toBe(375);
    expect(priceIls(100, at(3, { markup: 2 }), null)).toBe(600);
    expect(priceIls(100, at(3), 0)).toBe(480);
  });

  it("rounds to the admin's step and keeps the minimum", () => {
    expect(priceIls(100, at(3.171, { roundTo: 10 }))).toBe(510);
    expect(priceIls(100, at(3.171, { roundTo: 5 }))).toBe(505);
    expect(priceIls("0.10", at(3.171, { roundTo: 10 }))).toBe(10);
    expect(priceIls("1.00", at(3.171, { minIls: 20 }))).toBe(20);
    expect(roundIls(12.4, { roundTo: 1, minIls: null })).toBe(12);
  });

  it("returns null when there is no usable price", () => {
    for (const usd of [null, undefined, "0.00", 0, -5, "abc"]) expect(priceIls(usd, at(3.5))).toBeNull();
  });

  it("refuses to price at a missing or zero rate", () => {
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => priceIls("10", at(rate))).toThrow();
  });
});

describe("resolveMarkup", () => {
  const rules: PricingRuleSet = { global: 1.6, bySupplier: new Map([["wcp", 1.5]]), byCategory: new Map([["motors", 1.3]]) };

  it("prefers the part's fixed price, then category, then supplier, then global", () => {
    expect(resolveMarkup(rules, { supplierId: "wcp", categoryId: "motors", fixedIls: 99 })).toEqual({ kind: "fixed", ils: 99 });
    expect(resolveMarkup(rules, { supplierId: "wcp", categoryId: "motors" })).toEqual({ kind: "markup", markup: 1.3, source: "category" });
    expect(resolveMarkup(rules, { supplierId: "wcp", categoryId: "gears" })).toEqual({ kind: "markup", markup: 1.5, source: "supplier" });
    expect(resolveMarkup(rules, { supplierId: "ctre", categoryId: null })).toEqual({ kind: "markup", markup: 1.6, source: "global" });
  });

  it("ignores an empty fixed price", () => {
    expect(resolveMarkup(rules, { supplierId: "wcp", fixedIls: null }).kind).toBe("markup");
    expect(resolveMarkup(rules, { supplierId: "wcp", fixedIls: 0 }).kind).toBe("markup");
  });
});

describe("hasUsdPrice", () => {
  it("accepts only positive numbers", () => {
    expect(hasUsdPrice("1.00")).toBe(true);
    for (const usd of [null, undefined, "0", "x", -1]) expect(hasUsdPrice(usd)).toBe(false);
  });
});

describe("vatSplit", () => {
  it("splits a VAT-inclusive total so net + VAT is the total", () => {
    expect(vatSplit(15800, 0.18)).toEqual({ net: 13389.83, vat: 2410.17, gross: 15800 });
    expect(vatSplit(118, 0.18)).toEqual({ net: 100, vat: 18, gross: 118 });
  });

  it("adds up to the agora for awkward amounts", () => {
    for (const gross of [1, 7, 99.99, 1234.56, 33333, 0.01]) {
      const { net, vat } = vatSplit(gross, 0.18);
      expect(Math.round((net + vat) * 100)).toBe(Math.round(gross * 100));
      expect(Math.round(net * 100)).toBe(net * 100);
      expect(Math.round(vat * 100)).toBe(Math.round(vat * 100));
    }
  });

  it("has no VAT at a zero rate, and nothing in nothing", () => {
    expect(vatSplit(500, 0)).toEqual({ net: 500, vat: 0, gross: 500 });
    expect(vatSplit(0, 0.18)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it("works for another rate", () => {
    expect(vatSplit(117, 0.17)).toEqual({ net: 100, vat: 17, gross: 117 });
  });
});

describe("vatLabel", () => {
  it("says the rate as a percent", () => {
    expect(vatLabel(0.18)).toBe("מע״מ 18%");
    expect(vatLabel(0.175)).toBe("מע״מ 17.5%");
  });
});

describe("formatIls with agorot", () => {
  it("shows agorot only when there are some", () => {
    expect(formatIls(2410.17, { agorot: true })).toContain("2,410.17");
    expect(formatIls(2410, { agorot: true })).not.toContain(".");
    expect(formatIls(2410.4)).not.toContain(".");
  });
});

describe("supplier discounts", () => {
  const gobilda = { supplier: "gobilda", percent: 25, label: "הנחת FTC", enabled: true, excludeTypes: ["MERCH"], excludeSkus: ["3122-0002-0001"] };

  it("gives goBILDA's parts 25% and leaves other suppliers alone", () => {
    expect(resolveDiscount([gobilda], { supplierCode: "gobilda", productType: "Hub Mount Gears", sku: "2305-0014-0040" })).toBe(0.25);
    expect(resolveDiscount([gobilda], { supplierCode: "rev", productType: "Hub Mount Gears", sku: "REV-41-1300" })).toBeNull();
  });

  it("leaves out excluded subcategories and SKUs, in any case or spacing", () => {
    expect(resolveDiscount([gobilda], { supplierCode: "gobilda", productType: " merch ", sku: "x" })).toBeNull();
    expect(resolveDiscount([gobilda], { supplierCode: "gobilda", productType: "Cameras", sku: "3122-0002-0001" })).toBeNull();
    expect(resolveDiscount([gobilda], { supplierCode: "gobilda", productType: "Cameras", sku: "3122-0001-0001" })).toBe(0.25);
  });

  it("gives none to a part priced by hand, a custom part or a rule that's off", () => {
    expect(resolveDiscount([gobilda], { supplierCode: "gobilda", priceOverridden: true })).toBeNull();
    expect(resolveDiscount([gobilda], { supplierCode: "gobilda", custom: true })).toBeNull();
    expect(resolveDiscount([{ ...gobilda, enabled: false }], { supplierCode: "gobilda" })).toBeNull();
    expect(resolveDiscount([{ ...gobilda, percent: 12.5 }], { supplierCode: "gobilda" })).toBe(0.125);
  });

  it("takes the discount off the USD price to the cent, before the multiplier", () => {
    expect(discountedUsd(19.99, 0.25)).toBe(14.99);
    expect(discountedUsd(100, null)).toBe(100);
    // $100 at 3.5 × 1.6: ₪560 before, ₪420 after.
    expect(priceIls(discountedUsd(100, 0.25), at(3.5))).toBe(420);
  });

  it("shows the tag and the struck price only when the discount applied and the price is lower", () => {
    const ctx = at(3.5, { discountLabels: discountLabels([gobilda]) });
    const part = { supplierCode: "gobilda", discount: "0.250", supplierPriceUsd: "100.00", markup: "1.600", fixedIls: null };
    expect(partDiscount(part, ctx, 420)).toEqual({ label: "הנחת FTC", beforeIls: 560 });
    expect(partDiscount({ ...part, discount: null }, ctx, 560)).toBeNull();
    expect(partDiscount({ ...part, fixedIls: "300" }, ctx, 300)).toBeNull();
    expect(partDiscount(part, ctx, null)).toBeNull();
    // A rule switched off since the regroup: no tag.
    expect(partDiscount(part, at(3.5), 420)).toBeNull();
  });

  it("puts one tag on a choice only when every priced part has it", () => {
    const d = (beforeIls: number) => ({ label: "הנחת FTC", beforeIls });
    expect(commonDiscount([{ priceIls: 30, discount: d(40) }, { priceIls: 60, discount: d(80) }, { priceIls: null, discount: null }])).toEqual(d(40));
    expect(commonDiscount([{ priceIls: 30, discount: d(40) }, { priceIls: 60, discount: null }])).toBeNull();
    expect(commonDiscount([])).toBeNull();
  });
});
