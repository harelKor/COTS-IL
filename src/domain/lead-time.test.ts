import { describe, expect, it } from "vitest";
import { leadTimeText, typicalLeadTime } from "./lead-time";

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
