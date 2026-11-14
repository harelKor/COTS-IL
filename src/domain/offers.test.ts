import { describe, expect, it } from "vitest";
import { offerReason, rankOffers, type Offer } from "./offers";

const offer = (id: string, o: Partial<Offer> = {}): Offer => ({ id, supplierCode: id, priceIls: 100, available: true, shipsLater: false, ...o });

describe("rankOffers", () => {
  it("puts in stock before preorder before sold out, whatever the price", () => {
    const ranked = rankOffers([offer("out", { available: false, priceIls: 10 }), offer("pre", { shipsLater: true, priceIls: 20 }), offer("now", { priceIls: 90 })], {});
    expect(ranked.map((o) => o.id)).toEqual(["now", "pre", "out"]);
  });
  it("then the lower price, then the faster vendor, else keeps the order", () => {
    const leads = { a: { minDays: 10, maxDays: 14 }, b: { minDays: 5, maxDays: 7 } };
    expect(rankOffers([offer("a"), offer("b")], leads).map((o) => o.id)).toEqual(["b", "a"]);
    expect(rankOffers([offer("a", { priceIls: 90 }), offer("b")], leads).map((o) => o.id)).toEqual(["a", "b"]);
    expect(rankOffers([offer("a"), offer("b")], {}).map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("offerReason", () => {
  it("says in stock when the others aren't", () => {
    const offers = [offer("a"), offer("b", { shipsLater: true, priceIls: 80 })];
    expect(offerReason(offers[0], offers, {})).toBe("במלאי");
    expect(offerReason(offers[1], offers, {})).toBeNull();
  });
  it("says cheaper between offers in stock", () => {
    const offers = [offer("a", { priceIls: 90 }), offer("b")];
    expect(offerReason(offers[0], offers, {})).toBe("זול יותר");
  });
  it("says faster when the price is the same and the lead time is known", () => {
    const offers = [offer("a"), offer("b")];
    expect(offerReason(offers[0], offers, { a: { minDays: 5, maxDays: 7 }, b: { minDays: 10, maxDays: 14 } })).toBe("מגיע מהר יותר");
    expect(offerReason(offers[0], offers, {})).toBeNull();
  });
  it("gives nothing for one offer or a tie", () => {
    expect(offerReason(offer("a"), [offer("a")], {})).toBeNull();
    expect(offerReason(offer("a"), [offer("a"), offer("b")], {})).toBeNull();
  });
});
