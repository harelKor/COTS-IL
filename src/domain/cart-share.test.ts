import { describe, expect, it } from "vitest";
import { decodeCart, encodeCart } from "./cart-share";

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
