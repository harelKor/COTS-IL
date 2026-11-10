import { describe, expect, it } from "vitest";
import { cartChanges, cartFingerprint, clampQty, groupBySupplier, isOrderable, maxMerge } from "./cart";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";

describe("isOrderable", () => {
  const ok = { variantMissing: null, productMissing: null, productStatus: "published", priceUsd: "10.00" };
  it("allows a sold part with a price", () => expect(isOrderable(ok)).toBe(true));
  it("blocks a part that left the catalog", () => {
    expect(isOrderable({ ...ok, variantMissing: new Date() })).toBe(false);
    expect(isOrderable({ ...ok, productMissing: new Date() })).toBe(false);
    expect(isOrderable({ ...ok, productStatus: "hidden" })).toBe(false);
  });
  it("blocks a part without a price", () => {
    expect(isOrderable({ ...ok, priceUsd: null })).toBe(false);
    expect(isOrderable({ ...ok, priceUsd: "0" })).toBe(false);
  });
});

describe("maxMerge", () => {
  it("adds parts that aren't in the cart", () => {
    expect(maxMerge([], [{ variantId: A, qty: 2 }])).toEqual([{ variantId: A, qty: 2 }]);
  });
  it("never sums: a part already in the cart ends at the larger quantity", () => {
    expect(maxMerge([{ variantId: A, qty: 3 }], [{ variantId: A, qty: 5 }])).toEqual([{ variantId: A, qty: 5 }]);
    expect(maxMerge([{ variantId: A, qty: 5 }], [{ variantId: A, qty: 3 }])).toEqual([]);
  });
  it("is idempotent: merging the same link twice changes nothing the second time", () => {
    const own = [{ variantId: A, qty: 1 }];
    const shared = [
      { variantId: A, qty: 4 },
      { variantId: B, qty: 2 },
    ];
    const first = maxMerge(own, shared);
    const after = [...own.filter((l) => !first.some((c) => c.variantId === l.variantId)), ...first];
    expect(maxMerge(after, shared)).toEqual([]);
  });
  it("collapses repeats, ignores zero and clamps", () => {
    expect(
      maxMerge(
        [],
        [
          { variantId: A, qty: 2 },
          { variantId: A, qty: 7 },
          { variantId: B, qty: 0 },
          { variantId: C, qty: 50000 },
        ],
      ),
    ).toEqual([
      { variantId: A, qty: 7 },
      { variantId: C, qty: 9999 },
    ]);
  });
});

describe("clampQty", () => {
  it("keeps quantities between 1 and 9999", () => {
    expect(clampQty(0)).toBe(1);
    expect(clampQty(2.6)).toBe(3);
    expect(clampQty(123456)).toBe(9999);
  });
});

describe("cartFingerprint", () => {
  it("ignores order and case", () => {
    expect(
      cartFingerprint([
        { variantId: A, qty: 1 },
        { variantId: B, qty: 2 },
      ]),
    ).toBe(
      cartFingerprint([
        { variantId: B, qty: 2 },
        { variantId: A.toUpperCase(), qty: 1 },
      ]),
    );
  });
  it("changes when a quantity, a line or a removal changes", () => {
    const base = cartFingerprint([{ variantId: A, qty: 1 }]);
    expect(cartFingerprint([{ variantId: A, qty: 2 }])).not.toBe(base);
    expect(
      cartFingerprint([
        { variantId: A, qty: 1 },
        { variantId: B, qty: 1 },
      ]),
    ).not.toBe(base);
    expect(cartFingerprint([])).not.toBe(base);
  });
});

describe("cartChanges", () => {
  it("lists added, removed and changed lines", () => {
    expect(
      cartChanges(
        [
          { variantId: A, qty: 1 },
          { variantId: B, qty: 2 },
        ],
        [
          { variantId: A, qty: 3 },
          { variantId: C, qty: 1 },
        ],
      ),
    ).toEqual([
      { variantId: A, before: 1, after: 3 },
      { variantId: B, before: 2, after: 0 },
      { variantId: C, before: 0, after: 1 },
    ]);
  });
});

describe("groupBySupplier", () => {
  it("keeps the first-seen supplier order", () => {
    const groups = groupBySupplier([
      { supplierName: "WCP", id: 1 },
      { supplierName: "AndyMark", id: 2 },
      { supplierName: "WCP", id: 3 },
    ]);
    expect(groups.map((g) => [g.supplierName, g.lines.map((l) => l.id)])).toEqual([
      ["WCP", [1, 3]],
      ["AndyMark", [2]],
    ]);
  });
});
