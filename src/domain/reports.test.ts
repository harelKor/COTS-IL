import { describe, expect, it } from "vitest";
import { averageHours, excludingVat, isAvailabilityFresh, profitSummary } from "./reports";

describe("excludingVat", () => {
  it("takes 18% VAT out of a price", () => {
    expect(excludingVat(1180)).toBeCloseTo(1000);
  });
});

describe("profitSummary", () => {
  const base = { revenueInclVat: 1180, purchaseUsd: 100, usdIlsRate: 3.5, importCosts: [] };

  it("is revenue without VAT minus purchases converted at the given rate", () => {
    const result = profitSummary(base);
    expect(result.revenueExVat).toBeCloseTo(1000);
    expect(result.purchaseIls).toBeCloseTo(350);
    expect(result.profit).toBeCloseTo(650);
    expect(result.marginPct).toBeCloseTo(65);
  });

  it("does not count reclaimable VAT as a cost (AT-10)", () => {
    const result = profitSummary({
      ...base,
      importCosts: [
        { amountIls: 100, vatReclaimable: false },
        { amountIls: 180, vatReclaimable: true },
      ],
    });
    expect(result.importCostIls).toBe(100);
    expect(result.reclaimableVatIls).toBe(180);
    expect(result.profit).toBeCloseTo(550);
  });

  it("counts import VAT that can't be reclaimed", () => {
    expect(profitSummary({ ...base, importCosts: [{ amountIls: 180, vatReclaimable: false }] }).profit).toBeCloseTo(470);
  });

  it("has no margin without revenue", () => {
    expect(profitSummary({ ...base, revenueInclVat: 0 }).marginPct).toBeNull();
  });
});

describe("averageHours", () => {
  const start = new Date("2026-01-01T00:00:00Z");

  it("averages finished rows and ignores open ones", () => {
    expect(
      averageHours([
        { start, end: new Date("2026-01-01T10:00:00Z") },
        { start, end: new Date("2026-01-01T20:00:00Z") },
        { start, end: null },
      ]),
    ).toBe(15);
  });

  it("is null when nothing finished", () => {
    expect(averageHours([{ start, end: null }])).toBeNull();
  });
});

describe("isAvailabilityFresh", () => {
  const now = new Date("2026-01-10T00:00:00Z");

  it("trusts recent checks only", () => {
    expect(isAvailabilityFresh(new Date("2026-01-08T00:00:00Z"), now)).toBe(true);
    expect(isAvailabilityFresh(new Date("2026-01-06T00:00:00Z"), now)).toBe(false);
  });
});
