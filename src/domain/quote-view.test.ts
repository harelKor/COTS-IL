import { describe, expect, it } from "vitest";
import { orderTimeline, teamStepLabel } from "./order-status";
import { quoteChanges, quoteValidUntil, reorderLines, undoOpen, UNDO_SECONDS, waitingFirst } from "./quote-view";

const items = [
  { id: "a", title: "Kraken X60", supplierSku: "WCP-0940", qty: 2, unitPriceIls: 900 },
  { id: "b", title: "Spur Gear", supplierSku: null, qty: 4, unitPriceIls: 30 },
  { id: "c", title: "Bearing", supplierSku: "217-2", qty: 10, unitPriceIls: 5 },
];

describe("quoteChanges", () => {
  it("lists changes from the request with their reasons, and a 0 line as removed", () => {
    const changes = quoteChanges(items, [
      { itemId: "a", qty: 2, unitPriceIls: 950, changeReason: "מחיר עודכן" },
      { itemId: "b", qty: 0, unitPriceIls: 30, changeReason: "אזל" },
      { itemId: "c", qty: 10, unitPriceIls: 5, changeReason: null },
    ]);
    expect(changes.map((c) => [c.itemId, c.kind, c.reason])).toEqual([
      ["a", "price", "מחיר עודכן"],
      ["b", "removed", "אזל"],
    ]);
  });

  it("compares with the previous version when there is one", () => {
    const v1 = [
      { itemId: "a", qty: 1, unitPriceIls: 950, changeReason: "x" },
      { itemId: "b", qty: 0, unitPriceIls: 30, changeReason: "x" },
    ];
    const v2 = [
      { itemId: "a", qty: 2, unitPriceIls: 960, changeReason: "" },
      { itemId: "b", qty: 0, unitPriceIls: 30, changeReason: "x" },
    ];
    const changes = quoteChanges(items, v2, v1);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "qty_price", qtyBefore: 1, qtyAfter: 2, priceBefore: 950, priceAfter: 960, reason: null });
  });
});

describe("undo window", () => {
  it("is open for UNDO_SECONDS", () => {
    const at = new Date("2026-11-11T10:00:00Z");
    expect(undoOpen(at, new Date(at.getTime() + UNDO_SECONDS * 1000))).toBe(true);
    expect(undoOpen(at, new Date(at.getTime() + UNDO_SECONDS * 1000 + 1))).toBe(false);
  });
});

describe("quoteValidUntil", () => {
  it("is hidden until the business sets the days", () => {
    expect(quoteValidUntil(new Date(), null)).toBeNull();
    expect(quoteValidUntil(new Date("2026-11-01T00:00:00Z"), 14)?.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });
});

describe("reorderLines", () => {
  const ordered = [
    { id: "a", variantId: "va", qty: 2 },
    { id: "b", variantId: "vb", qty: 4 },
  ];
  it("uses the approved quantities and skips removed lines", () => {
    expect(
      reorderLines(ordered, [
        { itemId: "a", qty: 3, unitPriceIls: 1, changeReason: null },
        { itemId: "b", qty: 0, unitPriceIls: 1, changeReason: null },
      ]),
    ).toEqual([{ variantId: "va", qty: 3 }]);
  });
  it("falls back to the request without an approved quote", () => {
    expect(reorderLines(ordered, null)).toEqual([
      { variantId: "va", qty: 2 },
      { variantId: "vb", qty: 4 },
    ]);
  });
});

describe("waitingFirst", () => {
  it("puts quotes waiting for the team first", () => {
    const orders = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const { waiting, rest } = waitingFirst(orders, new Map([["1", "ordered"], ["2", "quote_sent"], ["3", "delivered"]] as const));
    expect(waiting.map((o) => o.id)).toEqual(["2"]);
    expect(rest.map((o) => o.id)).toEqual(["1", "3"]);
  });
});

describe("dated timeline", () => {
  it("dates the steps reached and says 'ready for pickup' for pickup orders", () => {
    const submitted = new Date("2026-11-01T08:00:00Z");
    const quoted = new Date("2026-11-02T08:00:00Z");
    const steps = orderTimeline("to_team", undefined, { awaiting_quote: submitted, quote_sent: quoted, delivered: new Date() }, true);
    expect(steps[0].date).toBe(submitted);
    expect(steps[1].date).toBe(quoted);
    expect(steps.find((s) => s.step === "to_team")?.label).toBe("מוכנה לאיסוף");
    // A step still ahead shows no date, even if one is passed.
    expect(steps.find((s) => s.step === "delivered")?.date).toBeNull();
    expect(teamStepLabel("to_team", false)).toBe("במשלוח אליכם");
  });
});
