import { describe, expect, it } from "vitest";
import {
  canAdvance,
  isFinished,
  LINE_LABELS,
  lineStatus,
  orderStatus,
  orderTimeline,
  STATUS_LABELS,
  type LineFacts,
} from "./order-status";

const line = (p: Partial<LineFacts> = {}): LineFacts => ({
  supplierName: "WCP",
  quoted: 2,
  ordered: 0,
  inTransit: false,
  allocated: 0,
  prepared: 0,
  delivered: 0,
  ...p,
});

describe("orderStatus", () => {
  it("follows the stored status before approval and after a stop", () => {
    expect(orderStatus("submitted", []).status).toBe("awaiting_quote");
    expect(orderStatus("quote_sent", []).status).toBe("quote_sent");
    expect(orderStatus("rejected", [line()]).status).toBe("rejected");
    expect(orderStatus("cancelled", [line()]).status).toBe("cancelled");
  });

  it("walks every step of an approved order", () => {
    expect(orderStatus("approved", []).status).toBe("to_order");
    expect(orderStatus("approved", [line()]).status).toBe("to_order");
    expect(orderStatus("approved", [line({ ordered: 2 })]).status).toBe("ordered");
    expect(orderStatus("approved", [line({ ordered: 2, inTransit: true })]).status).toBe("to_warehouse");
    expect(orderStatus("approved", [line({ ordered: 2, allocated: 2 })]).status).toBe("at_warehouse");
    expect(orderStatus("approved", [line({ ordered: 2, allocated: 2, prepared: 2 })]).status).toBe("to_team");
    expect(orderStatus("approved", [line({ ordered: 2, allocated: 2, delivered: 2 })]).status).toBe("delivered");
  });

  it("is at the earliest line, with the split by line and by supplier", () => {
    const view = orderStatus("approved", [line({ ordered: 2 }), line({ supplierName: "AndyMark" })]);
    expect(view.status).toBe("to_order");
    expect(view.progress).toBe("1 מתוך 2 פריטים כבר הוזמנו מהספק");
    expect(view.vendors).toBe("WCP הוזמן, AndyMark ממתין");
  });

  it("order #1001: received, set aside and on a note is ready to hand over on every screen", () => {
    const lines = [
      line({ quoted: 7, ordered: 7, allocated: 7, prepared: 7 }),
      line({ supplierName: "The Thrifty Bot", quoted: 1, ordered: 1, allocated: 1, prepared: 1 }),
    ];
    expect(orderStatus("approved", lines).status).toBe("to_team");
    expect(lines.map(lineStatus)).toEqual(["to_team", "to_team"]);
  });

  it("keeps a partly received line on its way to the warehouse", () => {
    expect(lineStatus(line({ ordered: 2, allocated: 1, inTransit: true }))).toBe("to_warehouse");
    expect(lineStatus(line({ ordered: 2, allocated: 1 }))).toBe("ordered");
  });

  it("keeps a partly ordered line waiting to be ordered even if some of it shipped", () => {
    expect(lineStatus(line({ quoted: 3, ordered: 2, inTransit: true }))).toBe("to_order");
  });

  it("treats a line with part delivered and part on a note as ready to hand over", () => {
    expect(lineStatus(line({ ordered: 2, allocated: 2, prepared: 1, delivered: 1 }))).toBe("to_team");
  });

  it("ignores lines quoted at zero", () => {
    expect(orderStatus("approved", [line({ quoted: 0 }), line({ ordered: 2 })]).status).toBe("ordered");
  });

  it("knows which statuses are finished", () => {
    expect(["delivered", "rejected", "cancelled"].every((s) => isFinished(s as never))).toBe(true);
    expect(isFinished("to_team")).toBe(false);
  });
});

describe("labels", () => {
  it("never says a bare 'נשלחה'", () => {
    const all = [...Object.values(STATUS_LABELS).flatMap((l) => [l.admin, l.team]), ...Object.values(LINE_LABELS)];
    expect(all.filter((l) => /^נשלח[הו]?$/.test(l.trim()))).toEqual([]);
  });
});

describe("orderTimeline", () => {
  it("marks steps done, current and ahead", () => {
    const steps = orderTimeline("ordered");
    expect(steps.map((s) => s.state).slice(0, 5)).toEqual(["done", "done", "done", "current", "ahead"]);
    expect(steps.at(-1)?.step).toBe("delivered");
  });

  it("shows where a stopped order stopped", () => {
    const steps = orderTimeline("cancelled", "quote_sent");
    expect(steps.find((s) => s.state === "current")?.step).toBe("quote_sent");
  });
});

describe("canAdvance", () => {
  it("lets each step take only what the one before passed on", () => {
    expect(canAdvance("ship", { reached: 4, done: 1 }, 3)).toBeNull();
    expect(canAdvance("ship", { reached: 4, done: 1 }, 4)).toMatch(/שהוזמן/);
    expect(canAdvance("receive", { reached: 2, done: 0 }, 3)).toMatch(/שנשלח/);
    expect(canAdvance("prepare_delivery", { reached: 0, done: 0 }, 1)).toMatch(/שהגיע למחסן/);
    expect(canAdvance("prepare_delivery", { reached: 5, done: 2 }, 3)).toBeNull();
    expect(canAdvance("deliver", { reached: 2, done: 0 }, 3)).toMatch(/בתעודת משלוח/);
  });

  it("refuses fractions and negatives, allows zero", () => {
    expect(canAdvance("ship", { reached: 4, done: 0 }, 1.5)).toBe("כמות לא תקינה");
    expect(canAdvance("ship", { reached: 4, done: 0 }, -1)).toBe("כמות לא תקינה");
    expect(canAdvance("ship", { reached: 4, done: 0 }, 0)).toBeNull();
  });
});
