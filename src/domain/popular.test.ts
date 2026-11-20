import { describe, expect, it } from "vitest";
import { bestSellerHandles, demandScores, interleave, orderWeight, pageCount, pickDiscovery, rankPopular, seededRandom, wrappedPage, type FamilySignals } from "./popular";

const f = (id: string, over: Partial<FamilySignals> = {}): FamilySignals => ({
  id,
  pinRank: null,
  bestSellerRank: null,
  teams: 0,
  qty: 0,
  available: true,
  accessory: false,
  hasImage: true,
  priceUsd: 50,
  ...over,
});

describe("rankPopular", () => {
  it("puts pins first, by pin", () => {
    const list = [f("a", { bestSellerRank: 1 }), f("b", { pinRank: 2 }), f("c", { pinRank: 1 })];
    expect(rankPopular(list, 3)).toEqual(["c", "b", "a"]);
  });

  it("follows the vendor's best-seller list while there are no orders", () => {
    const list = [f("a", { bestSellerRank: 30 }), f("b", { bestSellerRank: 2 }), f("c")];
    expect(rankPopular(list, 3)).toEqual(["b", "a", "c"]);
  });

  it("lets real orders take over as teams order", () => {
    const many = Array.from({ length: 30 }, (_, i) => f(`t${i}`, { teams: 1, qty: 1, bestSellerRank: 200 }));
    const list = [...many, f("store-top", { bestSellerRank: 1 }), f("ours", { teams: 10, qty: 40 })];
    expect(rankPopular(list, 1)).toEqual(["ours"]);
  });

  it("keeps the store's list ahead of a single order", () => {
    const list = [f("one-order", { teams: 1, qty: 1 }), f("store-top", { bestSellerRank: 1 })];
    expect(rankPopular(list, 1)).toEqual(["store-top"]);
  });

  it("falls back to in-stock main items with a photo, pricier first", () => {
    const list = [
      f("cheap", { priceUsd: 5 }),
      f("acc", { accessory: true, priceUsd: 500 }),
      f("out", { available: false, priceUsd: 900 }),
      f("motor", { priceUsd: 200 }),
    ];
    expect(rankPopular(list, 4)).toEqual(["motor", "cheap", "acc", "out"]);
  });
});

describe("orderWeight and demandScores", () => {
  it("grows from 0 to 1 with the teams ordering", () => {
    expect(orderWeight([f("a")])).toBe(0);
    expect(orderWeight([f("a", { teams: 5 }), f("b", { teams: 100 })])).toBe(1);
  });
  it("halves a sold-out part's demand", () => {
    const s = demandScores([f("a", { bestSellerRank: 1 }), f("b", { bestSellerRank: 1, available: false })]);
    expect(s.get("b")).toBeCloseTo((s.get("a") ?? 0) / 2);
  });
});

describe("pickDiscovery", () => {
  const list = Array.from({ length: 40 }, (_, i) => f(`p${i}`, { priceUsd: i + 1 }));

  it("is the same for the same seed and changes with it", () => {
    const a = pickDiscovery(list, [], "2026-11-13:wcp", 6);
    expect(pickDiscovery(list, [], "2026-11-13:wcp", 6)).toEqual(a);
    expect(pickDiscovery(list, [], "2026-11-14:wcp", 6)).not.toEqual(a);
  });

  it("keeps to the middle prices, in stock, with a photo, not popular, not accessories", () => {
    const extra = [f("nophoto", { hasImage: false, priceUsd: 25 }), f("out", { available: false, priceUsd: 25 }), f("acc", { accessory: true, priceUsd: 25 })];
    const picks = pickDiscovery([...list, ...extra], ["p20"], "seed", 40);
    const prices = picks.map((id) => Number(id.slice(1)) + 1);
    expect(picks).not.toContain("p20");
    expect(picks.some((id) => ["nophoto", "out", "acc"].includes(id))).toBe(false);
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(16);
    expect(Math.max(...prices)).toBeLessThanOrEqual(35);
  });
});

describe("seededRandom", () => {
  it("gives numbers in [0, 1) and repeats for a seed", () => {
    const a = seededRandom("x");
    const b = seededRandom("x");
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("bestSellerHandles", () => {
  const nav = '<a href="/products/menu-a"></a><a href="/products/menu-b"></a>';
  const footer = '<a href="/products/footer-x"></a>';
  const page = (grid: string[]) => nav + grid.map((h) => `<a href="/collections/all/products/${h}?variant=1"></a>`).join("") + footer;

  it("keeps the grid in the page's order, without the menu and footer", () => {
    expect(bestSellerHandles(page(["kraken-x60", "hex-shaft", "kraken-x60", "belt"]), page(["belt", "hex-shaft", "kraken-x60"]))).toEqual([
      "kraken-x60",
      "hex-shaft",
      "belt",
    ]);
  });

  it("reads the products' JSON when the grid is drawn in the browser (AndyMark)", () => {
    const json = (grid: string[]) => nav + `<script>${JSON.stringify(grid.map((handle) => ({ handle })))}</script>` + footer;
    expect(bestSellerHandles(json(["wheel", "bumper", "hex", "belt", "gear", "wheel"]), json(["belt", "bumper", "gear", "hex", "wheel"]))).toEqual([
      "wheel",
      "bumper",
      "hex",
      "belt",
      "gear",
    ]);
  });

  it("finds nothing when the store gave the same page both times", () => {
    expect(bestSellerHandles(page(["a", "b"]), page(["a", "b"]))).toEqual([]);
  });
});

describe("interleave", () => {
  it("takes turns and drops repeats", () => {
    expect(interleave([["a", "b", "c"], ["x"], ["b", "y"]], (s) => s)).toEqual(["a", "x", "b", "y", "c"]);
  });
});

describe("wrappedPage", () => {
  const pool = ["a", "b", "c", "d", "e"];
  it("pages through the pool and wraps both ways", () => {
    expect(pageCount(5, 2)).toBe(3);
    expect(wrappedPage(pool, 0, 2)).toEqual(["a", "b"]);
    expect(wrappedPage(pool, 2, 2)).toEqual(["e", "a"]);
    expect(wrappedPage(pool, 3, 2)).toEqual(["a", "b"]);
    expect(wrappedPage(pool, -1, 2)).toEqual(["e", "a"]);
  });
  it("shows every item once before repeating", () => {
    const seen = [0, 1, 2].flatMap((p) => wrappedPage(pool, p, 2)).slice(0, 5);
    expect(new Set(seen).size).toBe(5);
  });
  it("handles a pool smaller than a page and an empty pool", () => {
    expect(wrappedPage(["a"], 7, 10)).toEqual(["a"]);
    expect(wrappedPage([], 0, 10)).toEqual([]);
  });
});
