import { describe, expect, it } from "vitest";
import {
  canAdvance,
  isFinished,
  compactTimeline,
  deliveryLabel,
  lineLabel,
  LINE_STATUSES,
  lineStatus,
  ORDER_STATUS_KEYS,
  orderStatus,
  orderTimeline,
  shipmentStatus,
  STATUS,
  statusLabel,
  statusTone,
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

describe("the status dictionary", () => {
  const every = ORDER_STATUS_KEYS.flatMap((k) => [statusLabel(k, "admin"), statusLabel(k, "team"), statusLabel(k, "team", true)]);

  it("never says a bare 'נשלחה'", () => {
    const all = [...every, ...LINE_STATUSES.flatMap((s) => [lineLabel(s, "admin"), lineLabel(s, "team", true)])];
    expect(all.filter((l) => /^נשלח[הו]?$/.test(l.trim()))).toEqual([]);
  });

  it("gives each status its own words, so two statuses never share a name", () => {
    for (const audience of ["admin", "team"] as const) {
      const words = ORDER_STATUS_KEYS.map((k) => statusLabel(k, audience));
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it("names 'ready' once for the admin and by pickup or delivery for the team (A-01)", () => {
    expect(statusLabel("to_team", "admin")).toBe("מוכנה למסירה");
    expect(statusLabel("to_team", "admin", true)).toBe("מוכנה למסירה");
    expect(statusLabel("to_team", "team", true)).toBe("מוכנה לאיסוף");
    expect(statusLabel("to_team", "team", false)).toBe("מוכנה למשלוח אליכם");
    // The pickup form only exists for "ready".
    expect(statusLabel("ordered", "team", true)).toBe(statusLabel("ordered", "team"));
  });

  it("calls a line and a delivery note by the order's word for the same step", () => {
    for (const s of LINE_STATUSES.filter((s) => s !== "to_order")) {
      expect(lineLabel(s, "admin")).toBe(statusLabel(s, "admin"));
      expect(lineLabel(s, "team", true)).toBe(statusLabel(s, "team", true));
    }
    expect(lineLabel("to_order", "team")).toBe("ממתינה להזמנה מהספק");
    expect(deliveryLabel("prepared", "admin")).toBe(statusLabel("to_team", "admin"));
    expect(deliveryLabel("prepared", "team", true)).toBe(statusLabel("to_team", "team", true));
    expect(deliveryLabel("delivered", "team")).toBe("נמסרה");
  });

  it("order #1008's state reads the same on the tab, the card, the deliveries list and the team page", () => {
    // Two units received and on an unconfirmed pickup note.
    const view = orderStatus("approved", [line({ ordered: 2, allocated: 2, prepared: 2 })]);
    expect(view.status).toBe("to_team");
    const adminTab = statusLabel(view.status, "admin");
    const deliveriesList = deliveryLabel("prepared", "admin");
    expect(deliveriesList).toBe(adminTab);
    const teamBadge = statusLabel(view.status, "team", true);
    const teamNote = deliveryLabel("prepared", "team", true);
    const teamTimeline = orderTimeline(view.status, undefined, {}, true).find((s) => s.state === "current")?.label;
    expect(new Set([teamBadge, teamNote, teamTimeline]).size).toBe(1);
  });

  it("gives every status one of five tones, the admin's moves in 'us'", () => {
    expect(new Set(ORDER_STATUS_KEYS.map(statusTone))).toEqual(new Set(["us", "team", "neutral", "done", "problem"]));
    expect(statusTone("quote_sent")).toBe("team");
    expect(statusTone("delivered")).toBe("done");
    expect(statusTone("rejected")).toBe("problem");
    expect(Object.keys(STATUS).sort()).toEqual([...ORDER_STATUS_KEYS].sort());
  });
});

describe("shipmentStatus", () => {
  it("is derived from units: nothing, some, or all received (A-03)", () => {
    expect(shipmentStatus({ shipped: 2, received: 0 })).toBe("in_transit");
    expect(shipmentStatus({ shipped: 2, received: 1 })).toBe("partly_received");
    expect(shipmentStatus({ shipped: 2, received: 2 })).toBe("received");
  });
});

describe("compactTimeline", () => {
  it("folds the done steps, keeps the current one and shows the next", () => {
    const t = compactTimeline("ordered");
    expect(t.done.map((s) => s.step)).toEqual(["awaiting_quote", "quote_sent", "to_order"]);
    expect(t.current.step).toBe("ordered");
    expect(t.next?.step).toBe("to_warehouse");
  });

  it("labels a stopped order by how it stopped, with nothing after it", () => {
    const t = compactTimeline("cancelled", "quote_sent");
    expect(t.current.step).toBe("quote_sent");
    expect(t.current.label).toBe("בוטלה");
    expect(t.next).toBeNull();
  });

  it("ends at delivered", () => {
    const t = compactTimeline("delivered");
    expect(t.current.step).toBe("delivered");
    expect(t.next).toBeNull();
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
