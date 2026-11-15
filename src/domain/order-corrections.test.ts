import { describe, expect, it } from "vitest";
import {
  canAdminCancel,
  canEditLines,
  canReopen,
  cancelPlan,
  deleteBlocker,
  moveBlocker,
  reopenTarget,
  replaceBlocker,
  replacementNeedsApproval,
  validateRevision,
  type CancelLine,
} from "./order-corrections";
import type { OrderStatus } from "./orders";

const ALL: OrderStatus[] = ["submitted", "quote_sent", "approved", "rejected", "cancelled"];

describe("which corrections each status allows", () => {
  it("cancels at every stage except an order already cancelled", () => {
    expect(ALL.filter(canAdminCancel)).toEqual(["submitted", "quote_sent", "approved", "rejected"]);
  });

  it("reopens only a rejected or cancelled order", () => {
    expect(ALL.filter(canReopen)).toEqual(["rejected", "cancelled"]);
  });

  it("edits lines only on an open order", () => {
    expect(ALL.filter(canEditLines)).toEqual(["submitted", "quote_sent", "approved"]);
  });
});

describe("reopenTarget", () => {
  it("goes back to waiting for a quote when no quote was ever sent", () => {
    expect(reopenTarget("submitted", null)).toEqual({ status: "submitted", quote: null });
    expect(reopenTarget(null, null)).toEqual({ status: "submitted", quote: null });
  });

  it("goes back to waiting for the team, with the last quote open again", () => {
    expect(reopenTarget("quote_sent", "superseded")).toEqual({ status: "quote_sent", quote: "sent" });
    // The team rejected the quote: the log has no order-level stop, the quote says rejected.
    expect(reopenTarget(null, "rejected")).toEqual({ status: "quote_sent", quote: "sent" });
  });

  it("goes back to approved when the admin cancelled an approved order", () => {
    expect(reopenTarget("approved", "superseded")).toEqual({ status: "approved", quote: "approved" });
  });

  it("an order the admin cancelled after the team rejected it goes back to waiting for the team", () => {
    expect(reopenTarget("rejected", "rejected")).toEqual({ status: "quote_sent", quote: "sent" });
  });
});

const line = (over: Partial<CancelLine>): CancelLine => ({
  itemId: "i",
  label: "WCP-0749",
  onDraft: 0,
  ordered: 0,
  shipped: 0,
  received: 0,
  prepared: 0,
  delivered: 0,
  ...over,
});

describe("cancelPlan", () => {
  it("before anything was bought: nothing to warn about, nothing left over", () => {
    expect(cancelPlan([line({}), line({ itemId: "j" })])).toEqual({ blocked: null, released: 0, surplus: [], warnings: [] });
  });

  it("releases units on draft supplier orders", () => {
    const plan = cancelPlan([line({ onDraft: 3 }), line({ itemId: "j", onDraft: 2 })]);
    expect(plan.released).toBe(5);
    expect(plan.surplus).toEqual([]);
    expect(plan.blocked).toBeNull();
  });

  it("keeps ordered units as surplus and warns", () => {
    const plan = cancelPlan([line({ ordered: 4 })]);
    expect(plan.surplus).toEqual([{ itemId: "i", label: "WCP-0749", qty: 4, stage: "ordered" }]);
    expect(plan.warnings[0]).toContain("4 יחידות כבר הוזמנו מהספק");
  });

  it("records shipped and received surplus at the furthest stage reached", () => {
    const plan = cancelPlan([line({ ordered: 4, shipped: 4 }), line({ itemId: "j", ordered: 2, shipped: 2, received: 2 })]);
    expect(plan.surplus.map((s) => s.stage)).toEqual(["shipped", "received"]);
    expect(plan.warnings).toHaveLength(3);
  });

  it("delivered units aren't surplus: the team has them", () => {
    const plan = cancelPlan([line({ ordered: 3, shipped: 3, received: 3, delivered: 1 })]);
    expect(plan.surplus).toEqual([{ itemId: "i", label: "WCP-0749", qty: 2, stage: "received" }]);
    expect(plan.warnings.at(-1)).toContain("יחידה אחת כבר נמסרה");
  });

  it("everything delivered leaves no surplus", () => {
    expect(cancelPlan([line({ ordered: 2, shipped: 2, received: 2, delivered: 2 })]).surplus).toEqual([]);
  });

  it("is blocked while units sit on an unconfirmed delivery note", () => {
    const plan = cancelPlan([line({ ordered: 2, shipped: 2, received: 2, prepared: 2 })]);
    expect(plan.blocked).toContain("קודם צריך לבטל את התעודה");
  });
});

describe("deleteBlocker", () => {
  it("deletes an order no supplier order points at, in any status", () => {
    for (const status of ALL) expect(deleteBlocker({ onSupplierOrders: 0, status })).toBeNull();
  });

  it("refuses once a line was on a supplier order, even a cancelled one", () => {
    expect(deleteBlocker({ onSupplierOrders: 1, status: "cancelled" })).toContain("אפשר לבטל");
  });
});

describe("moveBlocker", () => {
  it("moves to another team", () => {
    expect(moveBlocker({ fromTeamId: "a", toTeamId: "b", onDeliveryNotes: 0 })).toBeNull();
  });

  it("refuses the same team, and an order on a delivery note", () => {
    expect(moveBlocker({ fromTeamId: "a", toTeamId: "a", onDeliveryNotes: 0 })).not.toBeNull();
    expect(moveBlocker({ fromTeamId: "a", toTeamId: "b", onDeliveryNotes: 2 })).toContain("תעודות משלוח");
  });
});

describe("replaceBlocker", () => {
  const ok = { status: "approved" as OrderStatus, ordered: 0, sameVariant: false, hasPrice: true };
  it("replaces a line that wasn't bought yet", () => {
    expect(replaceBlocker(ok)).toBeNull();
  });
  it("refuses a closed order, a bought line, the same part and a part with no price", () => {
    expect(replaceBlocker({ ...ok, status: "cancelled" })).not.toBeNull();
    expect(replaceBlocker({ ...ok, ordered: 1 })).toContain("כבר הוזמן");
    expect(replaceBlocker({ ...ok, sameVariant: true })).not.toBeNull();
    expect(replaceBlocker({ ...ok, hasPrice: false })).not.toBeNull();
  });
});

describe("replacementNeedsApproval", () => {
  it("only after a quote went out, and only when the price changed", () => {
    expect(replacementNeedsApproval({ status: "submitted", quotedPrice: null, newPrice: 90 })).toBe(false);
    expect(replacementNeedsApproval({ status: "quote_sent", quotedPrice: 90, newPrice: 90 })).toBe(false);
    expect(replacementNeedsApproval({ status: "quote_sent", quotedPrice: 90, newPrice: 95 })).toBe(true);
    expect(replacementNeedsApproval({ status: "approved", quotedPrice: 90, newPrice: 80 })).toBe(true);
  });
});

describe("validateRevision", () => {
  const previous = [
    { itemId: "a", qty: 2, unitPriceIls: 100, changeReason: null },
    { itemId: "b", qty: 1, unitPriceIls: 50, changeReason: "מחיר מעודכן" },
  ];
  const input = (itemId: string, qty: number, unitPriceIls: number, changeReason = "") => ({ itemId, qty, unitPriceIls, changeReason });

  it("accepts the same lines, and a new price with a new reason", () => {
    expect(validateRevision(previous, [input("a", 2, 100), input("b", 1, 50, "מחיר מעודכן")])).toEqual({});
    expect(validateRevision(previous, [input("a", 2, 120, "הספק העלה מחיר"), input("b", 1, 50, "מחיר מעודכן")])).toEqual({});
  });

  it("refuses a changed quantity", () => {
    expect(validateRevision(previous, [input("a", 3, 100)])).toHaveProperty("a");
  });

  it("refuses a new price with no reason, or with the old version's reason", () => {
    expect(validateRevision(previous, [input("a", 2, 120)])).toHaveProperty("a");
    expect(validateRevision(previous, [input("b", 1, 60, "מחיר מעודכן")])).toHaveProperty("b");
  });
});
