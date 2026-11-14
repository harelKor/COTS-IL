import { describe, expect, it } from "vitest";
import { arrivalShort, arrivalText, leadTimeText, typicalLeadTime } from "./lead-time";

describe("leadTimeText", () => {
  it("hides an unknown lead time", () => {
    expect(leadTimeText(null)).toBeNull();
    expect(leadTimeText({ minDays: 0, maxDays: 0 })).toBeNull();
  });
  it("shows a range or a single value", () => {
    expect(leadTimeText({ minDays: 7, maxDays: 10 })).toBe("7–10 ימים");
    expect(leadTimeText({ minDays: 10, maxDays: 7 })).toBe("7–10 ימים");
    expect(leadTimeText({ minDays: 5, maxDays: 5 })).toBe("5 ימים");
  });
});

describe("typicalLeadTime", () => {
  it("spans the known suppliers and skips unknown ones", () => {
    expect(typicalLeadTime([null, { minDays: 7, maxDays: 10 }, { minDays: 12, maxDays: 18 }])).toBe("7–18 ימים");
    expect(typicalLeadTime([null, undefined])).toBeNull();
  });
});

describe("arrivalText", () => {
  it("shows nothing while the lead time is empty", () => {
    expect(arrivalText(null)).toBeNull();
    expect(arrivalShort(undefined)).toBeNull();
  });
  it("counts from the approval, or from the supplier's shipping for a preorder", () => {
    expect(arrivalText({ minDays: 7, maxDays: 10 })).toBe("מגיע לישראל תוך 7–10 ימים מאישור ההצעה");
    expect(arrivalText({ minDays: 7, maxDays: 10 }, true)).toBe("מגיע לישראל תוך 7–10 ימים מרגע שהספק שולח");
    expect(arrivalShort({ minDays: 7, maxDays: 10 })).toBe("מגיע תוך 7–10 ימים");
  });
});
