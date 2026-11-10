import { describe, expect, it } from "vitest";
import { leadTimeText } from "./lead-time";

describe("leadTimeText", () => {
  it("hides the sentence while the lead time is unknown", () => {
    expect(leadTimeText(null)).toBeNull();
    expect(leadTimeText(undefined)).toBeNull();
  });
  it("rounds days to weeks", () => {
    expect(leadTimeText({ minDays: 14, maxDays: 21 })).toBe("מגיע לישראל תוך כ-2–3 שבועות");
    expect(leadTimeText({ minDays: 20, maxDays: 22 })).toBe("מגיע לישראל תוך כ-3 שבועות");
    expect(leadTimeText({ minDays: 3, maxDays: 6 })).toBe("מגיע לישראל תוך כשבוע");
  });
});
