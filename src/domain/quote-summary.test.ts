import { describe, expect, it } from "vitest";
import { quoteSummary } from "./quote-summary";

describe("quoteSummary", () => {
  it("adds shipping, shows the VAT inside and the change from the request", () => {
    const s = quoteSummary(
      [
        { qty: 2, unitPriceIls: 100, requestedQty: 2, requestedPrice: 90 },
        { qty: 0, unitPriceIls: 50, requestedQty: 1, requestedPrice: 50 },
      ],
      36,
    );
    expect(s).toEqual({ subtotal: 200, shipping: 36, total: 236, vat: 36, requested: 230, difference: -30 });
  });
  it("treats empty fields as zero", () => {
    expect(quoteSummary([{ qty: NaN, unitPriceIls: 10, requestedQty: 1, requestedPrice: 10 }], null).total).toBe(0);
  });
});
