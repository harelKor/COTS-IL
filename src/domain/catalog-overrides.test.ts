import { describe, expect, it } from "vitest";
import {
  applyProductOverrides,
  effectivePriceUsd,
  familyPinRank,
  isEmptyOverride,
  suspiciousMultiSupplier,
  type ProductOverride,
} from "./catalog-overrides";
import { priceIls } from "./pricing";

const none: Omit<ProductOverride, "productId"> = { hidden: false, images: null, categorySlug: null, alone: false, mergeKey: null, pinRank: null };
const product = (id: string) => ({ id, supplierCode: "wcp", title: id, categorySlug: "gears", descriptionHtml: null, images: ["a.jpg", "b.jpg"], variants: [] });

describe("effectivePriceUsd", () => {
  it("uses the override, then priceIls prices it", () => {
    expect(effectivePriceUsd("10.00", "12.5")).toBe("12.50");
    expect(priceIls(effectivePriceUsd("10.00", "12.5"), 3.7)).toBe(46);
  });
  it("keeps the store's price with no override or a bad one", () => {
    expect(effectivePriceUsd("10.00", null)).toBe("10.00");
    expect(effectivePriceUsd("10.00", "0")).toBe("10.00");
    expect(effectivePriceUsd(null, undefined)).toBeNull();
  });
});

describe("applyProductOverrides", () => {
  it("drops hidden products and applies photos, category, split and merge", () => {
    const overrides = new Map<string, ProductOverride>([
      ["h", { ...none, productId: "h", hidden: true }],
      ["x", { ...none, productId: "x", images: ["c.jpg"], categorySlug: "motors", alone: true, mergeKey: "k" }],
    ]);
    const out = applyProductOverrides([product("h"), product("x"), product("y")], overrides);
    expect(out.map((p) => p.id)).toEqual(["x", "y"]);
    expect(out[0]).toMatchObject({ images: ["c.jpg"], categorySlug: "motors", alone: true, mergeKey: "k" });
    expect(out[1]).toEqual(product("y"));
  });
  it("keeps the store's photos when the override has none", () => {
    const out = applyProductOverrides([product("x")], new Map([["x", { ...none, productId: "x", images: [] }]]));
    expect(out[0].images).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("familyPinRank", () => {
  it("takes the lowest pin of the family's products", () => {
    const o = new Map<string, ProductOverride>([
      ["a", { ...none, productId: "a", pinRank: 5 }],
      ["b", { ...none, productId: "b", pinRank: 2 }],
    ]);
    expect(familyPinRank(["a", "b", "c"], o)).toBe(2);
    expect(familyPinRank(["c"], o)).toBeNull();
    expect(familyPinRank(["a"], new Map([["a", { ...none, productId: "a", pinRank: 0 }]]))).toBe(0);
  });
});

describe("isEmptyOverride", () => {
  it("is empty only when nothing is set", () => {
    expect(isEmptyOverride(none)).toBe(true);
    expect(isEmptyOverride({ ...none, pinRank: 0 })).toBe(false);
    expect(isEmptyOverride({ ...none, images: [] })).toBe(true);
  });
});

describe("suspiciousMultiSupplier", () => {
  const m = (supplierCode: string, title: string, categorySlug: string | null = "gears") => ({ supplierCode, title, categorySlug });
  it("passes a reseller's copy of the same part", () => {
    expect(
      suspiciousMultiSupplier(
        [m("wcp", "Steel Spur Gear (20 DP)"), m("ctre", "WCP Steel Spur Gears")],
        [
          { sku: "WCP-0749", supplierCode: "wcp", priceUsd: "10.99" },
          { sku: "wcp-0749", supplierCode: "ctre", priceUsd: "11.99" },
        ],
      ),
    ).toEqual([]);
  });
  it("flags names with nothing in common, far-apart prices and different categories", () => {
    expect(
      suspiciousMultiSupplier(
        [m("wcp", "Steel Spur Gear"), m("ctre", "Kraken X60 Motor", "motors")],
        [
          { sku: "X", supplierCode: "wcp", priceUsd: "10" },
          { sku: "X", supplierCode: "ctre", priceUsd: "200" },
        ],
      ),
    ).toEqual(["names", "prices", "categories"]);
  });
  it("doesn't flag a different category on its own", () => {
    expect(suspiciousMultiSupplier([m("wcp", "Constant Force Spring", "fasteners"), m("ctre", "Constant Force Spring", "mechanisms")], [])).toEqual([]);
  });
  it("says nothing about a single-supplier family", () => {
    expect(suspiciousMultiSupplier([m("wcp", "A thing"), m("wcp", "Other")], [])).toEqual([]);
  });
});
