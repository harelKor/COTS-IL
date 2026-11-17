import { describe, expect, it } from "vitest";
import { deletePlan, deleteSnapshot, type DeletePoShare, type DeleteStockShare } from "./order-delete";

const share = (over: Partial<DeletePoShare>): DeletePoShare => ({ poLineId: "l1", orderItemId: "i1", qty: 2, poStatus: "draft", poNumber: 5001, ...over });
const stock = (over: Partial<DeleteStockShare>): DeleteStockShare => ({ id: "s1", qty: 2, delivered: 0, prepared: 0, ...over });

describe("deletePlan", () => {
  it("deletes a fresh order with nothing to untie", () => {
    const plan = deletePlan([], []);
    expect(plan.removeShares).toEqual([]);
    expect(plan.unassignShares).toEqual([]);
    expect(plan.removeStock).toEqual([]);
    expect(plan.keepStock).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it("takes the order's units off draft and cancelled supplier orders", () => {
    const draft = share({ poStatus: "draft", qty: 3 });
    const cancelled = share({ poLineId: "l2", poStatus: "cancelled", poNumber: 5002 });
    const plan = deletePlan([draft, cancelled], []);
    expect(plan.removeShares).toEqual([draft, cancelled]);
    expect(plan.unassignShares).toEqual([]);
    expect(plan.released).toBe(3);
    expect(plan.warnings[0]).toContain("מטיוטות");
  });

  it("keeps units on supplier orders marked ordered, for no team, so the totals stay", () => {
    const a = share({ poStatus: "ordered", poNumber: 5003, qty: 2 });
    const b = share({ poLineId: "l2", poStatus: "ordered", poNumber: 5001, qty: 1 });
    const plan = deletePlan([a, b, share({ poLineId: "l3", poStatus: "draft", qty: 4 })], []);
    expect(plan.unassignShares).toEqual([a, b]);
    expect(plan.removeShares).toHaveLength(1);
    expect(plan.keptOrdered).toBe(3);
    expect(plan.orderedPoNumbers).toEqual([5001, 5003]);
    expect(plan.warnings.join(" ")).toContain("הזמנת ספק 5001, הזמנת ספק 5003");
    expect(plan.warnings.join(" ")).toContain("ללא קבוצה");
  });

  it("frees received units that weren't delivered, prepared notes included", () => {
    const plan = deletePlan([], [stock({ id: "a", qty: 3 }), stock({ id: "b", qty: 2, prepared: 2 })]);
    expect(plan.removeStock).toEqual(["a", "b"]);
    expect(plan.keepStock).toEqual([]);
    expect(plan.warnings.join(" ")).toContain("5 יחידות במחסן חוזרות");
    expect(plan.warnings.join(" ")).toContain("שעוד לא נמסרו");
  });

  it("keeps delivered units counted as taken, shrunk to what was delivered", () => {
    const plan = deletePlan([], [stock({ id: "a", qty: 5, delivered: 3, prepared: 1 })]);
    expect(plan.removeStock).toEqual([]);
    expect(plan.keepStock).toEqual([{ id: "a", qty: 3 }]);
    expect(plan.warnings.join(" ")).toContain("כבר נמסרו");
  });

  it("speaks of one unit in the singular", () => {
    const plan = deletePlan([share({ poStatus: "ordered", qty: 1 })], [stock({ qty: 1, delivered: 1 })]);
    expect(plan.warnings.join(" ")).toContain("יחידה אחת כבר הוזמנה");
    expect(plan.warnings.join(" ")).toContain("יחידה אחת כבר נמסרה");
  });
});

describe("deleteSnapshot", () => {
  it("sums the lines and keeps the last quote", () => {
    const snap = deleteSnapshot({
      order: { id: "o", number: 1042, status: "approved", teamId: "t", submittedAt: "2026-11-01T00:00:00Z" },
      team: "FRC 1690",
      items: [
        { supplierCode: "wcp", supplierSku: "WCP-1", title: "Gear", qty: 2, unitPriceIls: 100 },
        { supplierCode: "andymark", supplierSku: null, title: "Belt", qty: 1, unitPriceIls: 50 },
      ],
      quotes: [
        { version: 1, status: "superseded", shippingIls: 0 },
        { version: 2, status: "approved", shippingIls: 80 },
      ],
      plan: { keptOrdered: 2, released: 0, orderedPoNumbers: [5001] },
    });
    expect(snap).toMatchObject({ orderNumber: 1042, team: "FRC 1690", lines: 2, units: 3, requestedIls: 250, quoteVersions: 2, supplierOrders: [5001] });
    expect(snap.lastQuote).toEqual({ version: 2, status: "approved", shippingIls: 80 });
  });
});
