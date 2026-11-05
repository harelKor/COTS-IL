import { describe, expect, it } from "vitest";
import { parseQuickQuery, tokenIsPartName } from "./quick-query";

describe("parseQuickQuery", () => {
  it("reads a trailing x4 as the quantity", () => {
    expect(parseQuickQuery("htd pulley x4")).toMatchObject({ q: "htd pulley", qty: 4, token: "x4" });
    expect(parseQuickQuery("WCP-0749 ×12")).toMatchObject({ q: "WCP-0749", qty: 12, token: "×12" });
  });

  it("needs a space before the quantity", () => {
    expect(parseQuickQuery("2x4")).toMatchObject({ q: "2x4", qty: 1, token: null });
  });

  it("clamps the quantity", () => {
    expect(parseQuickQuery("bearing x0")).toMatchObject({ q: "bearing", qty: 1 });
    expect(parseQuickQuery("bearing x9999")).toMatchObject({ q: "bearing", qty: 9999 });
    expect(parseQuickQuery("bearing x99999")).toMatchObject({ q: "bearing x99999", qty: 1 });
  });

  it("trims and collapses spaces", () => {
    expect(parseQuickQuery("  1/2  hex   bearing  ")).toEqual({ text: "1/2 hex bearing", q: "1/2 hex bearing", qty: 1, token: null });
  });
});

describe("tokenIsPartName", () => {
  it("spots a model number in the results", () => {
    expect(tokenIsPartName("x60", ["Kraken X60 Powered by TalonFX", "Kraken X44"])).toBe(true);
  });

  it("ignores the token inside a longer word or number", () => {
    expect(tokenIsPartName("x4", ["HTD 5mm Pulley, 1/2in Hex", "MAX4 Spacer", "4x4 Plate"])).toBe(false);
  });

  it("reads × as x", () => {
    expect(tokenIsPartName("×60", ["Kraken X60"])).toBe(true);
  });
});
