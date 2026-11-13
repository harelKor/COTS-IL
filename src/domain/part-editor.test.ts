import { describe, expect, it } from "vitest";
import {
  customHandle,
  isEmptyVariantOverride,
  listUsd,
  partBadges,
  partRemoval,
  productOverrideFields,
  readOptions,
  variantOverrideFields,
  textToHtml,
  htmlToText,
  sameDescription,
} from "./part-editor";
import { priceIls, resolveMarkup, type PriceContext, type PricingRuleSet } from "./pricing";

const ctx: PriceContext = { rate: 3.7, markup: 1.6, roundTo: 1, minIls: null };

describe("partRemoval", () => {
  it("deletes a custom part nobody ordered", () => {
    expect(partRemoval({ source: "custom", orderLines: 0 })).toBe("delete");
  });
  it("hides a custom part with orders", () => {
    expect(partRemoval({ source: "custom", orderLines: 2 })).toBe("hide");
  });
  it("only ever hides a synced part", () => {
    expect(partRemoval({ source: "synced", orderLines: 0 })).toBe("hide");
    expect(partRemoval({ source: "synced", orderLines: 5 })).toBe("hide");
  });
});

describe("price precedence", () => {
  const rules: PricingRuleSet = { global: 1.6, bySupplier: new Map([["s", 1.5]]), byCategory: new Map([["c", 1.4]]) };

  it("a fixed ₪ price beats category, supplier and global", () => {
    expect(resolveMarkup(rules, { supplierId: "s", categoryId: "c", fixedIls: 99 })).toEqual({ kind: "fixed", ils: 99 });
    expect(resolveMarkup(rules, { supplierId: "s", categoryId: "c" })).toMatchObject({ source: "category" });
    expect(resolveMarkup(rules, { supplierId: "s", categoryId: "x" })).toMatchObject({ source: "supplier" });
    expect(resolveMarkup(rules, { supplierId: "x" })).toMatchObject({ source: "global" });
  });

  it("priceIls returns the fixed price whatever the rate, multiplier and minimum", () => {
    expect(priceIls("10", ctx, 1.6, "120")).toBe(120);
    expect(priceIls("10", { ...ctx, rate: 4, minIls: 500 }, 2, 120)).toBe(120);
    expect(priceIls("10", ctx, 1.6, null)).toBe(59);
    expect(priceIls("10", ctx, 1.6, "0")).toBe(59);
  });

  it("a family's list price gives the fixed price back at the same rate", () => {
    const list = listUsd({ priceUsd: "10", markup: "1.6", fixedIls: "120" }, 3.7)!;
    expect(priceIls(list, ctx, 1)).toBe(120);
    expect(listUsd({ priceUsd: "10", markup: "1.5", fixedIls: null }, 3.7)).toBe(15);
    expect(listUsd({ priceUsd: null, markup: "1.5", fixedIls: null }, 3.7)).toBeNull();
  });
});

describe("productOverrideFields", () => {
  const store = { title: "Steel Gear", descriptionHtml: "<p>x</p>", images: ["a", "b"] };

  it("keeps only what differs from the store", () => {
    expect(productOverrideFields(store, { ...store, available: null })).toEqual({ title: null, descriptionHtml: null, images: null, available: null });
    expect(productOverrideFields(store, { ...store, title: "גלגל שיניים", images: ["b", "a"], available: false })).toEqual({
      title: "גלגל שיניים",
      descriptionHtml: null,
      images: ["b", "a"],
      available: false,
    });
  });

  it("an emptied description is an override of nothing, not 'as the store'", () => {
    expect(productOverrideFields(store, { ...store, descriptionHtml: "", available: null }).descriptionHtml).toBe("");
  });
});

describe("variantOverrideFields", () => {
  const store = { sku: "WCP-1", options: [{ name: "Teeth", value: "36t" }], priceUsd: "10.00" };

  it("an edit that matches the store is empty", () => {
    const o = variantOverrideFields(store, { ...store, priceUsd: "10", fixedIls: null, hidden: false });
    expect(isEmptyVariantOverride(o)).toBe(true);
  });

  it("stores a new price, fixed price, SKU, options and hiding", () => {
    const o = variantOverrideFields(store, { sku: "WCP-2", options: [{ name: "Teeth", value: "40t" }], priceUsd: "12.5", fixedIls: 80, hidden: true });
    expect(o).toEqual({ priceUsd: "12.50", fixedIls: "80.00", sku: "WCP-2", options: [{ name: "Teeth", value: "40t" }], hidden: true });
  });
});

describe("helpers", () => {
  it("reads option pairs, dropping empty ones", () => {
    expect(readOptions(["Teeth", "Bore", ""], ["36t", "", "x"])).toEqual([{ name: "Teeth", value: "36t" }]);
  });
  it("makes a latin handle", () => {
    expect(customHandle('Custom Shaft 1/2" Hex')).toBe("custom-shaft-1-2-hex");
    expect(customHandle("ציר מיוחד")).toBe("part");
  });
  it("badges", () => {
    expect(partBadges({ hidden: true, source: "custom", manualPrice: true })).toEqual(["מוסתר", "מחיר ידני", "חלק ידני"]);
    expect(partBadges({ hidden: false, source: "synced", manualPrice: false })).toEqual([]);
  });
});

describe("descriptions", () => {
  it("turns text into escaped paragraphs and back", () => {
    const html = textToHtml("Line one\nline two\n\n<b>Second</b>");
    expect(html).toBe("<p>Line one<br>line two</p><p>&lt;b&gt;Second&lt;/b&gt;</p>");
    expect(htmlToText(html)).toBe("Line one\nline two\n\n<b>Second</b>");
    expect(textToHtml("  \n ")).toBeNull();
  });
  it("an untouched store description is not an edit", () => {
    expect(sameDescription("<p>Steel  gear.</p><ul><li>36t</li></ul>", htmlToText("<p>Steel  gear.</p><ul><li>36t</li></ul>"))).toBe(true);
    expect(sameDescription("<p>Steel gear.</p>", "Aluminum gear.")).toBe(false);
  });
});
