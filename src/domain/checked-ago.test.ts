import { describe, expect, it } from "vitest";
import { checkedAgo } from "./checked-ago";

const at = "2026-11-13T08:00:00Z";
const t = Date.parse(at);
const h = 60 * 60 * 1000;

describe("checkedAgo", () => {
  it("counts hours, then days", () => {
    expect(checkedAgo(at, t + 10 * 60 * 1000)).toBe("נבדק לפני פחות משעה");
    expect(checkedAgo(at, t + h)).toBe("נבדק לפני שעה");
    expect(checkedAgo(at, t + 2 * h)).toBe("נבדק לפני שעתיים");
    expect(checkedAgo(at, t + 5 * h)).toBe("נבדק לפני 5 שעות");
    expect(checkedAgo(at, t + 25 * h)).toBe("נבדק אתמול");
    expect(checkedAgo(at, t + 50 * h)).toBe("נבדק לפני יומיים");
    expect(checkedAgo(at, t + 80 * h)).toBe("נבדק לפני 3 ימים");
  });
  it("falls back to the day without a today", () => {
    expect(checkedAgo(at, null)).toBe("נבדק 13/11");
  });
});
