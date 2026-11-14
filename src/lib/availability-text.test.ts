import { describe, expect, it } from "vitest";
import { availabilityStatus } from "./availability-text";

const checked = "2026-11-13T08:00:00Z";

describe("availabilityStatus", () => {
  it("shows ships later in amber, with the ETA in Hebrew", () => {
    const s = availabilityStatus(true, checked, true, { shipsLater: true, eta: "late November" });
    expect(s.short).toBe("בהזמנה מראש");
    expect(s.text).toBe("בהזמנה מראש, צפוי לצאת: סוף נובמבר (נבדק 13/11)");
    expect(s.tone).toBe("text-warning");
  });

  it("leaves out the ETA when the supplier gives none", () => {
    expect(availabilityStatus(true, checked, true, { shipsLater: true }).text).toBe("בהזמנה מראש (נבדק 13/11)");
  });

  it("keeps in stock, sold out and unverified as before", () => {
    expect(availabilityStatus(true, checked, true).short).toBe("זמין");
    expect(availabilityStatus(false, checked, true, { shipsLater: true }).short).toBe("לא זמין");
    expect(availabilityStatus(true, checked, false, { shipsLater: true }).short).toBe("לא אומת");
  });
});

describe("availabilityStatus with a today", () => {
  it("says how many hours ago it was checked", () => {
    expect(availabilityStatus(true, checked, true, {}, Date.parse(checked) + 5 * 60 * 60 * 1000).text).toBe("זמין אצל הספק (נבדק לפני 5 שעות)");
  });
});
