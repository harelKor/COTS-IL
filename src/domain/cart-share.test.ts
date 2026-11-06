import { describe, expect, it } from "vitest";
import { decodeCart, encodeCart, parsePastedList } from "./cart-share";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";

describe("shared cart links", () => {
  it("round-trips a cart", () => {
    const lines = [
      { variantId: a, qty: 2 },
      { variantId: b, qty: 10 },
    ];
    expect(decodeCart(encodeCart(lines))).toEqual(lines);
  });

  it("skips malformed parts and merges repeats", () => {
    expect(decodeCart(`${a}.2~not-a-uuid.3~${b}.0~${a}.1~${b}.x`)).toEqual([{ variantId: a, qty: 3 }]);
    expect(decodeCart(null)).toEqual([]);
  });

  it("caps quantities", () => {
    expect(decodeCart(`${a}.99999`)).toEqual([{ variantId: a, qty: 9999 }]);
    expect(decodeCart(`${a}.9999~${a}.5`)).toEqual([{ variantId: a, qty: 9999 }]);
  });
});

describe("parsePastedList", () => {
  it("reads common BOM and chat formats", () => {
    const { lines } = parsePastedList(["SKU,Qty", "WCP-0749, 4", "am-1594\t2", "3 x WCP-0543", "2x 217-2000", "WCP-1472", ""].join("\n"));
    expect(lines).toEqual([
      { sku: "WCP-0749", qty: 4 },
      { sku: "am-1594", qty: 2 },
      { sku: "WCP-0543", qty: 3 },
      { sku: "217-2000", qty: 2 },
      { sku: "WCP-1472", qty: 1 },
    ]);
  });

  it("adds up repeats regardless of case", () => {
    expect(parsePastedList("wcp-0749,1\nWCP-0749,2").lines).toEqual([{ sku: "wcp-0749", qty: 3 }]);
  });

  it("reads quoted CSV cells and either column order", () => {
    expect(parsePastedList('"5","WCP-0749"').lines).toEqual([{ sku: "WCP-0749", qty: 5 }]);
  });

  it("reports rows it can't read", () => {
    expect(parsePastedList("some notes about the robot\nWCP-0749").skipped).toEqual(["some notes about the robot"]);
  });
});
