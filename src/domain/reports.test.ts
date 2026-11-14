import { describe, expect, it } from "vitest";
import {
  averageHours,
  formatDuration,
  isAvailabilityFresh,
  medianHours,
  periodPresets,
  profitSummary,
  purchaseCost,
} from "./reports";

describe("profitSummary", () => {
  const base = { revenueIls: 1000, purchaseIls: 350, importCosts: [] };

  it("is revenue minus purchases, with no VAT taken out of the revenue", () => {
    const result = profitSummary(base);
    expect(result.revenueIls).toBe(1000);
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
    expect(
      profitSummary({
        ...base,
        importCosts: [{ amountIls: 180, vatReclaimable: false }],
      }).profit,
    ).toBeCloseTo(470);
  });

  it("has no margin without revenue", () => {
    expect(profitSummary({ ...base, revenueIls: 0 }).marginPct).toBeNull();
  });
});

describe("purchaseCost", () => {
  const rows = [
    { purchaseUsd: 100, purchaseIlsAtBoi: 360 },
    { purchaseUsd: 100, purchaseIlsAtBoi: 380 },
  ];

  it("defaults to the sum of each order at its own Bank of Israel rate", () => {
    const cost = purchaseCost(rows, null);
    expect(cost).toMatchObject({ ils: 740, usd: 200, source: "boi" });
    expect(cost.rate).toBeCloseTo(3.7);
  });

  it("uses the typed card rate for everything when given", () => {
    expect(purchaseCost(rows, 3.5)).toMatchObject({
      ils: 700,
      usd: 200,
      rate: 3.5,
      source: "override",
    });
  });

  it("has no rate to show without purchases", () => {
    expect(purchaseCost([], null)).toMatchObject({ ils: 0, rate: null });
  });
});

describe("averageHours and medianHours", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const at = (hours: number) => new Date(start.getTime() + hours * 3_600_000);

  it("averages finished rows and ignores open ones", () => {
    expect(
      averageHours([
        { start, end: at(10) },
        { start, end: at(20) },
        { start, end: null },
      ]),
    ).toBe(15);
  });

  it("is null when nothing finished", () => {
    expect(averageHours([{ start, end: null }])).toBeNull();
    expect(medianHours([{ start, end: null }])).toBeNull();
  });

  it("takes the middle, so one slow order doesn't move it", () => {
    const pairs = [1, 2, 3, 200].map((h) => ({ start, end: at(h) }));
    expect(medianHours(pairs)).toBe(2.5);
    expect(averageHours(pairs)).toBe(51.5);
    expect(medianHours([1, 5, 9].map((h) => ({ start, end: at(h) })))).toBe(5);
  });
});

describe("formatDuration", () => {
  it("shows minutes, hours or days by size", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0.25)).toBe("15 דקות");
    expect(formatDuration(3.5)).toBe("3.5 שעות");
    expect(formatDuration(2)).toBe("2 שעות");
    expect(formatDuration(36)).toBe("1.5 ימים");
  });
});

describe("periodPresets", () => {
  const find = (now: string, key: string) => periodPresets(new Date(now)).find((p) => p.key === key);

  it("gives this month and last month in Israel's calendar", () => {
    expect(find("2026-11-14T10:00:00Z", "this-month")).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(find("2026-11-14T10:00:00Z", "last-month")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("rolls last month over the new year and handles February", () => {
    expect(find("2026-01-05T10:00:00Z", "last-month")).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(find("2028-02-10T10:00:00Z", "this-month")).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("uses Israel's date just after midnight there", () => {
    expect(find("2026-10-31T22:30:00Z", "this-month")).toMatchObject({
      from: "2026-11-01",
    });
  });

  it("has a season of January to April and an unbounded all", () => {
    expect(find("2026-11-14T10:00:00Z", "season")).toMatchObject({
      from: "2026-01-01",
      to: "2026-04-30",
    });
    expect(find("2026-11-14T10:00:00Z", "all")).toEqual({
      key: "all",
      label: "הכול",
    });
  });
});

describe("isAvailabilityFresh", () => {
  const now = new Date("2026-01-10T00:00:00Z");

  it("trusts recent checks only", () => {
    expect(isAvailabilityFresh(new Date("2026-01-08T00:00:00Z"), now)).toBe(true);
    expect(isAvailabilityFresh(new Date("2026-01-06T00:00:00Z"), now)).toBe(false);
  });
});
