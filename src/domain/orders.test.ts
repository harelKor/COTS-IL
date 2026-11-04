import { describe, expect, it } from "vitest";
import {
  canApproveQuote,
  canCancelOrder,
  canDecideQuote,
  canOrder,
  canSendQuote,
  diffQuoteLines,
  quoteContentHash,
  quoteTotals,
  validateQuoteLines,
} from "./orders";

describe("permissions", () => {
  it("lets buyers order but only team admins approve", () => {
    expect(canOrder("buyer")).toBe(true);
    expect(canOrder("viewer")).toBe(false);
    expect(canApproveQuote("team_admin")).toBe(true);
    expect(canApproveQuote("buyer")).toBe(false);
  });
});

describe("order status rules", () => {
  it("allows a decision only while a quote is waiting", () => {
    expect(canDecideQuote("quote_sent")).toBe(true);
    expect(canDecideQuote("approved")).toBe(false);
    expect(canDecideQuote("submitted")).toBe(false);
  });

  it("allows re-quoting an approved order but not a cancelled one", () => {
    expect(canSendQuote("approved")).toBe(true);
    expect(canSendQuote("cancelled")).toBe(false);
  });

  it("does not let an approved order be cancelled by the team", () => {
    expect(canCancelOrder("submitted")).toBe(true);
    expect(canCancelOrder("approved")).toBe(false);
  });
});

describe("quoteTotals", () => {
  it("adds lines and shipping", () => {
    expect(
      quoteTotals(
        [
          { qty: 2, unitPriceIls: 100 },
          { qty: 0, unitPriceIls: 50 },
        ],
        30,
      ),
    ).toEqual({ subtotal: 200, shipping: 30, total: 230 });
  });
});

describe("validateQuoteLines", () => {
  const items = [{ id: "a", qty: 2, unitPriceIls: 100 }];
  const line = { itemId: "a", qty: 2, unitPriceIls: 100, changeReason: "" };

  it("accepts an unchanged line", () => {
    expect(validateQuoteLines(items, [line])).toEqual({});
  });

  it("requires a reason when the price or quantity changes", () => {
    expect(validateQuoteLines(items, [{ ...line, unitPriceIls: 120 }]).a).toBeDefined();
    expect(validateQuoteLines(items, [{ ...line, qty: 1, changeReason: "  " }]).a).toBeDefined();
    expect(validateQuoteLines(items, [{ ...line, qty: 1, changeReason: "אזל במלאי" }])).toEqual({});
  });

  it("allows removing a line with a reason", () => {
    expect(validateQuoteLines(items, [{ ...line, qty: 0, changeReason: "לא זמין" }])).toEqual({});
  });

  it("rejects bad numbers and missing lines", () => {
    expect(validateQuoteLines(items, []).a).toBeDefined();
    expect(validateQuoteLines(items, [{ ...line, qty: -1 }]).a).toBeDefined();
    expect(validateQuoteLines(items, [{ ...line, qty: 1.5 }]).a).toBeDefined();
    expect(validateQuoteLines(items, [{ ...line, unitPriceIls: 0, changeReason: "x" }]).a).toBeDefined();
  });
});

describe("diffQuoteLines", () => {
  it("reports only what changed", () => {
    const changes = diffQuoteLines(
      [
        { itemId: "a", qty: 2, unitPriceIls: 100 },
        { itemId: "b", qty: 1, unitPriceIls: 50 },
      ],
      [
        { itemId: "a", qty: 2, unitPriceIls: 120 },
        { itemId: "b", qty: 1, unitPriceIls: 50 },
      ],
    );
    expect(changes.get("a")).toEqual({ priceBefore: 100 });
    expect(changes.has("b")).toBe(false);
  });
});

describe("quoteContentHash", () => {
  const quote = {
    orderId: "o",
    version: 1,
    shippingIls: 30,
    lines: [
      { itemId: "a", qty: 1, unitPriceIls: 10 },
      { itemId: "b", qty: 2, unitPriceIls: 20 },
    ],
  };

  it("ignores line order", () => {
    expect(quoteContentHash(quote)).toBe(quoteContentHash({ ...quote, lines: [...quote.lines].reverse() }));
  });

  it("changes with the content", () => {
    expect(quoteContentHash(quote)).not.toBe(quoteContentHash({ ...quote, shippingIls: 31 }));
    expect(quoteContentHash(quote)).not.toBe(quoteContentHash({ ...quote, version: 2 }));
  });
});
