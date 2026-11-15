import { describe, expect, it } from "vitest";
import { fifoAllocate, rebalanceAllocations, validateAllocations, validateReceiptLine } from "./logistics";

describe("fifoAllocate", () => {
  const shares = [
    { orderItemId: "a", open: 1 },
    { orderItemId: "b", open: 2 },
    { orderItemId: "c", open: 3 },
  ];

  it("fills the oldest orders first on a partial shipment, leaving the rest short", () => {
    expect(fifoAllocate(4, shares)).toEqual([
      { orderItemId: "a", qty: 1 },
      { orderItemId: "b", qty: 2 },
      { orderItemId: "c", qty: 1 },
    ]);
  });

  it("gives nothing when nothing good arrived", () => {
    expect(fifoAllocate(0, shares)).toEqual([]);
  });

  it("leaves surplus unallocated", () => {
    const result = fifoAllocate(99, shares);
    expect(result.reduce((sum, r) => sum + r.qty, 0)).toBe(6);
  });

  it("skips lines already covered", () => {
    expect(fifoAllocate(1, [{ orderItemId: "a", open: 0 }, { orderItemId: "b", open: 1 }])).toEqual([
      { orderItemId: "b", qty: 1 },
    ]);
  });
});

describe("validateReceiptLine", () => {
  it("accepts a partial receipt with damage", () => {
    expect(validateReceiptLine({ open: 6, received: 4, damaged: 1 })).toBeNull();
  });

  it("rejects impossible quantities", () => {
    expect(validateReceiptLine({ open: 6, received: 7, damaged: 0 })).not.toBeNull();
    expect(validateReceiptLine({ open: 6, received: 2, damaged: 3 })).not.toBeNull();
    expect(validateReceiptLine({ open: 6, received: 1.5, damaged: 0 })).not.toBeNull();
    expect(validateReceiptLine({ open: 6, received: -1, damaged: 0 })).not.toBeNull();
  });
});

describe("validateAllocations", () => {
  const row = { qty: 2, share: 3, allocatedElsewhere: 0, delivered: 0 };

  it("accepts a valid split", () => {
    expect(validateAllocations(3, [row, { ...row, qty: 1 }])).toBeNull();
  });

  it("can't allocate more than the good units received", () => {
    expect(validateAllocations(2, [row, { ...row, qty: 1 }])).not.toBeNull();
  });

  it("can't give a team more than it's owed", () => {
    expect(validateAllocations(9, [{ ...row, qty: 2, allocatedElsewhere: 2 }])).not.toBeNull();
  });

  it("can't take back what was delivered", () => {
    expect(validateAllocations(9, [{ ...row, qty: 1, delivered: 2 }])).not.toBeNull();
  });
});


describe("rebalanceAllocations", () => {
  const shares = [
    { orderItemId: "old", open: 0 },
    { orderItemId: "new", open: 0 },
  ];

  it("takes units back from the newest order first", () => {
    const held = [
      { orderItemId: "old", qty: 3, delivered: 0 },
      { orderItemId: "new", qty: 2, delivered: 0 },
    ];
    expect(rebalanceAllocations(4, held, shares)).toEqual([
      { orderItemId: "old", qty: 3 },
      { orderItemId: "new", qty: 1 },
    ]);
    expect(rebalanceAllocations(1, held, shares)).toEqual([
      { orderItemId: "old", qty: 1 },
      { orderItemId: "new", qty: 0 },
    ]);
  });

  it("never takes back units already on a delivery note", () => {
    const held = [
      { orderItemId: "old", qty: 3, delivered: 0 },
      { orderItemId: "new", qty: 2, delivered: 2 },
    ];
    expect(rebalanceAllocations(3, held, shares)).toEqual([
      { orderItemId: "old", qty: 1 },
      { orderItemId: "new", qty: 2 },
    ]);
  });

  it("refuses to go below what left on delivery notes", () => {
    expect(rebalanceAllocations(1, [{ orderItemId: "old", qty: 2, delivered: 2 }], shares)).toHaveProperty("error");
  });

  it("hands extra units out oldest first, within what each line is still owed", () => {
    const owed = [
      { orderItemId: "old", open: 1 },
      { orderItemId: "new", open: 3 },
    ];
    expect(rebalanceAllocations(5, [{ orderItemId: "new", qty: 1, delivered: 0 }], owed)).toEqual([
      { orderItemId: "old", qty: 1 },
      { orderItemId: "new", qty: 4 },
    ]);
  });

  it("leaves extra units unallocated once every line has its share", () => {
    expect(rebalanceAllocations(9, [{ orderItemId: "old", qty: 2, delivered: 0 }], [{ orderItemId: "old", open: 1 }])).toEqual([{ orderItemId: "old", qty: 3 }]);
  });

  it("keeps a line that is no longer among the shares (its order was cancelled) and trims it first", () => {
    expect(rebalanceAllocations(1, [{ orderItemId: "gone", qty: 1, delivered: 0 }, { orderItemId: "old", qty: 1, delivered: 0 }], [{ orderItemId: "old", open: 0 }])).toEqual([
      { orderItemId: "old", qty: 1 },
      { orderItemId: "gone", qty: 0 },
    ]);
  });
});
