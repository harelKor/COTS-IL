import { describe, expect, it } from "vitest";
import { decodeCart, encodeCart, takePendingCart, withPendingCart } from "./cart-share";

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

describe("pending cart in a sign-in link", () => {
  const lines = [
    { variantId: a, qty: 2 },
    { variantId: b, qty: 1 },
  ];

  it("adds the cart to a path with or without a query", () => {
    expect(withPendingCart("/catalog", lines)).toBe(`/catalog?pending=${a}.2~${b}.1`);
    expect(withPendingCart("/catalog?cart=open", lines)).toBe(`/catalog?cart=open&pending=${a}.2~${b}.1`);
  });

  it("leaves next alone when the cart is empty", () => {
    expect(withPendingCart("/catalog?cart=open", [])).toBe("/catalog?cart=open");
  });

  it("round-trips through the address and cleans it", () => {
    const url = new URL(withPendingCart("/catalog/p/x?cart=open", lines), "https://cots-il.vercel.app");
    expect(takePendingCart(url)).toEqual({ lines, cleaned: "/catalog/p/x?cart=open" });
  });

  it("survives being URL-encoded inside another link's next", () => {
    const next = withPendingCart("/?cart=open", lines);
    const link = new URL(`https://cots-il.vercel.app/auth/confirm?next=${encodeURIComponent(next)}&token_hash=abc&type=email`);
    const back = new URL(link.searchParams.get("next")!, link.origin);
    expect(takePendingCart(back)?.lines).toEqual(lines);
  });

  it("returns null when there is nothing to restore", () => {
    expect(takePendingCart(new URL("https://x.test/catalog"))).toBeNull();
  });
});
