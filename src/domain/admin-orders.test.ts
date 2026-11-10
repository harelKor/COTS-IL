import { describe, expect, it } from "vitest";
import { adminLineStage, adminOrderStatus, batchOrderCount, selectBatch, sortForAdmin, type AdminLine } from "./admin-orders";
import type { ConsolidatedLine } from "./purchasing";

const line = (p: Partial<AdminLine> = {}): AdminLine => ({
  supplierName: "WCP",
  quoted: 2,
  ordered: 0,
  allocated: 0,
  prepared: 0,
  delivered: 0,
  ...p,
});

describe("adminOrderStatus", () => {
  it("follows the order's own status before approval", () => {
    expect(adminOrderStatus("submitted", []).status).toBe("review");
    expect(adminOrderStatus("quote_sent", []).status).toBe("team");
    expect(adminOrderStatus("rejected", [])).toMatchObject({ status: "done", ended: "rejected" });
    expect(adminOrderStatus("cancelled", [])).toMatchObject({ status: "done", ended: "cancelled" });
  });

  it("walks each stage of an approved order", () => {
    expect(adminOrderStatus("approved", [line()]).status).toBe("to_send");
    expect(adminOrderStatus("approved", [line({ ordered: 2 })]).status).toBe("sent");
    expect(adminOrderStatus("approved", [line({ ordered: 2, allocated: 2 })]).status).toBe("warehouse");
    expect(adminOrderStatus("approved", [line({ ordered: 2, allocated: 2, prepared: 2 })]).status).toBe("out");
    expect(adminOrderStatus("approved", [line({ ordered: 2, allocated: 2, delivered: 2 })])).toMatchObject({
      status: "done",
      ended: "delivered",
    });
  });

  it("shows the earliest line and the split for an order over two vendors", () => {
    const view = adminOrderStatus("approved", [line({ ordered: 2 }), line({ supplierName: "AndyMark" })]);
    expect(view.status).toBe("to_send");
    expect(view.progress).toBe("1 מתוך 2 פריטים נשלחו לספק");
    expect(view.vendors).toBe("WCP נשלח, AndyMark ממתין");
  });

  it("keeps a partly received line in נשלחה", () => {
    const view = adminOrderStatus("approved", [line({ ordered: 2, allocated: 1 }), line({ ordered: 2, allocated: 2 })]);
    expect(view.status).toBe("sent");
    expect(view.progress).toBe("1 מתוך 2 פריטים הגיעו למחסן");
    expect(adminLineStage(line({ ordered: 2, allocated: 1 }))).toBe("sent");
  });

  it("treats a line with part delivered and part on a note as on its way", () => {
    expect(adminLineStage(line({ ordered: 2, allocated: 2, prepared: 1, delivered: 1 }))).toBe("out");
  });

  it("ignores lines quoted at zero", () => {
    expect(adminOrderStatus("approved", [line({ quoted: 0 }), line({ ordered: 2 })]).status).toBe("sent");
  });
});

describe("sortForAdmin", () => {
  it("puts what needs the admin first, oldest first", () => {
    const o = (status: "review" | "team" | "to_send", day: number) => ({
      view: { status, progress: null, vendors: null },
      submittedAt: new Date(2026, 10, day),
    });
    const sorted = sortForAdmin([o("team", 1), o("to_send", 2), o("review", 5), o("review", 3)]);
    expect(sorted.map((x) => `${x.view.status}${x.submittedAt.getDate()}`)).toEqual(["review3", "review5", "to_send2", "team1"]);
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
