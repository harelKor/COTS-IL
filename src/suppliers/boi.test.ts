import { describe, expect, it } from "vitest";
import { parseBoiUsdRate } from "./boi";

describe("parseBoiUsdRate", () => {
  it("reads the rate and its Israel date", () => {
    const body = { key: "USD", currentExchangeRate: 3.171, currentChange: -0.72, unit: 1, lastUpdate: "2026-11-09T15:12:45.98Z" };
    expect(parseBoiUsdRate(body)).toEqual({ rate: 3.171, rateDate: "2026-11-09" });
  });

  it("rejects a zero, missing or wrong rate", () => {
    for (const body of [
      { key: "USD", currentExchangeRate: 0, unit: 1, lastUpdate: "2026-11-09T15:00:00Z" },
      { key: "USD", unit: 1, lastUpdate: "2026-11-09T15:00:00Z" },
      { key: "EUR", currentExchangeRate: 3.6, unit: 1, lastUpdate: "2026-11-09T15:00:00Z" },
      null,
    ])
      expect(() => parseBoiUsdRate(body)).toThrow();
  });
});
