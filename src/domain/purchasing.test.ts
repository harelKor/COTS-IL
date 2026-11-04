import { describe, expect, it } from "vitest";
import { consolidateDemand, poTotalUsd, shopifyCartUrl, skuList, type DemandRow } from "./purchasing";

const row = (overrides: Partial<DemandRow>): DemandRow => ({
  orderItemId: "i1",
  orderNumber: 1001,
  teamLabel: "FRC 1690",
  supplierId: "wcp",
  supplierName: "WCP",
  platform: "shopify",
  variantId: "v1",
  supplierVariantId: "111",
  supplierSku: "WCP-1",
  title: "Gear",
  options: [],
  productUrl: "https://wcp/gear",
  costUsd: "10.00",
  quotedQty: 2,
  allocatedQty: 0,
  ...overrides,
});

describe("consolidateDemand", () => {
  it("merges the same variant from three teams and keeps each team's share", () => {
    const [supplier] = consolidateDemand([
      row({ orderItemId: "a", teamLabel: "FRC 1690", quotedQty: 2 }),
      row({ orderItemId: "b", teamLabel: "FRC 2212", quotedQty: 3 }),
      row({ orderItemId: "c", teamLabel: "FTC 20001", quotedQty: 1 }),
    ]);
    expect(supplier.lines).toHaveLength(1);
    expect(supplier.lines[0].qty).toBe(6);
    expect(supplier.lines[0].allocations.map((a) => [a.orderItemId, a.qty])).toEqual([
      ["a", 2],
      ["b", 3],
      ["c", 1],
    ]);
  });

  it("never merges different variants", () => {
    const [supplier] = consolidateDemand([row({ variantId: "v1" }), row({ variantId: "v2", orderItemId: "b" })]);
    expect(supplier.lines).toHaveLength(2);
  });

  it("separates suppliers", () => {
    const result = consolidateDemand([
      row({ supplierId: "wcp", supplierName: "WCP" }),
      row({ supplierId: "am", supplierName: "AndyMark", variantId: "v2", orderItemId: "b" }),
    ]);
    expect(result.map((s) => s.supplierName)).toEqual(["AndyMark", "WCP"]);
  });

  it("buys only what isn't already on a supplier order", () => {
    const [supplier] = consolidateDemand([row({ quotedQty: 5, allocatedQty: 2 })]);
    expect(supplier.lines[0].qty).toBe(3);
    expect(consolidateDemand([row({ quotedQty: 2, allocatedQty: 2 })])).toEqual([]);
  });
});

describe("shopifyCartUrl", () => {
  it("builds a cart permalink", () => {
    expect(
      shopifyCartUrl("https://store.example", [
        { supplierVariantId: "111", qty: 2 },
        { supplierVariantId: "222", qty: 1 },
      ]),
    ).toBe("https://store.example/cart/111:2,222:1");
  });
});

describe("skuList", () => {
  it("lists SKUs and falls back to the name when there is none", () => {
    expect(
      skuList([
        { supplierSku: "A-1", title: "Gear", options: [], qty: 2 },
        { supplierSku: null, title: "Belt", options: [{ value: "15mm" }] as never, qty: 1 },
      ]),
    ).toBe("A-1 x 2\n(no SKU) Belt - 15mm x 1");
  });
});

describe("poTotalUsd", () => {
  it("adds up lines and treats a missing cost as zero", () => {
    expect(
      poTotalUsd([
        { qty: 2, unitCostUsd: "10.50" },
        { qty: 1, unitCostUsd: null },
      ]),
    ).toBe(21);
  });
});
