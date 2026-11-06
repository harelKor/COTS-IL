import { describe, expect, it } from "vitest";
import { orderStage, orderTimeline } from "./order-stage";

const line = (p: Partial<{ quoted: number; ordered: number; inTransit: boolean; allocated: number; delivered: number }>) => ({
  quoted: 2,
  ordered: 0,
  inTransit: false,
  allocated: 0,
  delivered: 0,
  ...p,
});

describe("orderStage", () => {
  it("follows the order's own status until it's approved", () => {
    expect(orderStage("submitted", [])).toBe("requested");
    expect(orderStage("quote_sent", [])).toBe("quoted");
    expect(orderStage("rejected", [])).toBe("rejected");
    expect(orderStage("cancelled", [])).toBe("cancelled");
  });

  it("then follows the purchasing records", () => {
    expect(orderStage("approved", [line({})])).toBe("approved");
    expect(orderStage("approved", [line({ ordered: 2 }), line({})])).toBe("ordered");
    expect(orderStage("approved", [line({ ordered: 2, inTransit: true }), line({})])).toBe("in_transit");
    expect(orderStage("approved", [line({ ordered: 2, allocated: 2, delivered: 2 }), line({ ordered: 2 })])).toBe("in_transit");
    expect(orderStage("approved", [line({ ordered: 2, allocated: 2, delivered: 2 })])).toBe("delivered");
  });
});

describe("orderTimeline", () => {
  it("marks steps done, current and ahead", () => {
    expect(orderTimeline("ordered").map((s) => s.state)).toEqual(["done", "done", "done", "current", "ahead", "ahead"]);
  });

  it("shows where a stopped order stopped", () => {
    expect(orderTimeline("rejected", "quoted").map((s) => s.state)).toEqual(["done", "current", "ahead", "ahead", "ahead", "ahead"]);
  });
});
