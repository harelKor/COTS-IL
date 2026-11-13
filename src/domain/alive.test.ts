import { describe, expect, it } from "vitest";
import { aliveStyle, hash } from "./alive";

describe("aliveStyle", () => {
  it("is stable for an id and within its ranges", () => {
    expect(aliveStyle("abc")).toEqual(aliveStyle("abc"));
    for (const id of ["a", "b", "c", "family-1", "family-2", "x".repeat(40)]) {
      const s = aliveStyle(id);
      const hop = parseFloat(s["--hop"]);
      const hd = parseFloat(s["--hd"]);
      expect(hop).toBeGreaterThanOrEqual(7);
      expect(hop).toBeLessThanOrEqual(13);
      expect(hd).toBeGreaterThanOrEqual(0);
      expect(hd).toBeLessThanOrEqual(9);
    }
  });
  it("scatters neighbouring ids", () => {
    const delays = new Set(Array.from({ length: 20 }, (_, i) => aliveStyle(`card-${i}`)["--hd"]));
    expect(delays.size).toBeGreaterThan(10);
    expect(hash("a")).not.toBe(hash("b"));
  });
});
