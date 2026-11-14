import type { LeadTime } from "./settings";

/** What the product page knows about one vendor's offer of the chosen part. */
export type Offer = {
  id: string;
  supplierCode: string;
  priceIls: number | null;
  available: boolean | null;
  shipsLater: boolean;
};

export type OfferReason = "במלאי" | "זול יותר" | "מגיע מהר יותר";

/** In stock now, then preorder, then not checked, then sold out. */
const tier = (o: Offer) => (o.available === true ? (o.shipsLater ? 1 : 0) : o.available === null ? 2 : 3);
const price = (o: Offer) => o.priceIls ?? Number.POSITIVE_INFINITY;
const slowest = (o: Offer, leads: Record<string, LeadTime | null | undefined>) => leads[o.supplierCode]?.maxDays ?? Number.POSITIVE_INFINITY;

/**
 * The offers best first: in stock before preorder before sold out, then the
 * lower price, then the faster arrival (the vendor's lead time). Stable, so
 * equal offers keep the server's order.
 */
export function rankOffers<T extends Offer>(offers: T[], leads: Record<string, LeadTime | null | undefined>): T[] {
  return offers
    .map((o, i) => ({ o, i }))
    .sort((a, b) => tier(a.o) - tier(b.o) || price(a.o) - price(b.o) || slowest(a.o, leads) - slowest(b.o, leads) || a.i - b.i)
    .map(({ o }) => o);
}

/**
 * Why `offer` is the better pick over every other offer, in the order the
 * ranking weighs it; null when nothing sets it apart (then no badge shows).
 */
export function offerReason(offer: Offer, offers: Offer[], leads: Record<string, LeadTime | null | undefined>): OfferReason | null {
  const others = offers.filter((o) => o.id !== offer.id);
  if (others.length === 0) return null;
  if (others.every((o) => tier(offer) < tier(o)) && tier(offer) === 0) return "במלאי";
  if (others.some((o) => tier(o) < tier(offer))) return null;
  const peers = others.filter((o) => tier(o) === tier(offer));
  if (peers.some((o) => price(o) < price(offer))) return null;
  const samePrice = peers.filter((o) => price(o) === price(offer));
  if (samePrice.length === 0) return offer.priceIls === null ? null : "זול יותר";
  const mine = slowest(offer, leads);
  if (Number.isFinite(mine) && samePrice.every((o) => mine < slowest(o, leads))) return "מגיע מהר יותר";
  return null;
}
