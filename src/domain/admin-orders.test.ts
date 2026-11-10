import { describe, expect, it } from "vitest";
import { batchOrderCount, selectBatch, sortForAdmin } from "./admin-orders";
import type { ConsolidatedLine } from "./purchasing";

describe("sortForAdmin", () => {
  it("puts what needs the admin first, oldest first", () => {
    const o = (status: "awaiting_quote" | "quote_sent" | "to_order", day: number) => ({
      view: { status, progress: null, vendors: null },
      submittedAt: new Date(2026, 10, day),
    });
    const sorted = sortForAdmin([o("quote_sent", 1), o("to_order", 2), o("awaiting_quote", 5), o("awaiting_quote", 3)]);
    expect(sorted.map((x) => `${x.view.status}${x.submittedAt.getDate()}`)).toEqual([
      "awaiting_quote3",
      "awaiting_quote5",
      "to_order2",
      "quote_sent1",
    ]);
  });
});

describe("selectBatch", () => {
  const wcp: ConsolidatedLine = {
    variantId: "v1",
    supplierVariantId: "1",
    supplierSku: "WCP-1",
    title: "Gear",
    options: [],
    productUrl: "",
    costUsd: "5.00",
    qty: 4,
    allocations: [
      { orderItemId: "a", orderNumber: 1, teamLabel: "FRC 1690", qty: 2 },
      { orderItemId: "b", orderNumber: 2, teamLabel: "FRC 2231", qty: 1 },
      { orderItemId: "c", orderNumber: 3, teamLabel: "FTC 99", qty: 1 },
    ],
  };

  it("holds everything by default, serving three orders", () => {
    expect(selectBatch([wcp], new Set())).toEqual([wcp]);
    expect(batchOrderCount([wcp])).toBe(3);
  });

  it("leaves out excluded order lines and drops empty rows", () => {
    const [kept] = selectBatch([wcp], new Set(["b"]));
    expect(kept.qty).toBe(3);
    expect(kept.allocations.map((a) => a.orderItemId)).toEqual(["a", "c"]);
    expect(selectBatch([wcp], new Set(["a", "b", "c"]))).toEqual([]);
  });
});
