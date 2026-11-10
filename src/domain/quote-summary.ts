import { VAT_RATE } from "./reports";

type Line = { qty: number; unitPriceIls: number; requestedQty: number; requestedPrice: number };

/**
 * The quote editor's totals above Send: subtotal, shipping, the VAT already inside the
 * prices, the total, and how far it moved from what the team asked for (the request has no shipping).
 */
export function quoteSummary(lines: Line[], shippingIls: number | null) {
  const subtotal = lines.reduce((sum, l) => sum + safe(l.qty) * safe(l.unitPriceIls), 0);
  const requested = lines.reduce((sum, l) => sum + l.requestedQty * l.requestedPrice, 0);
  const shipping = safe(shippingIls ?? 0);
  const total = subtotal + shipping;
  return {
    subtotal,
    shipping,
    total,
    /** Prices include VAT, so this is the part of the total that is VAT. */
    vat: Math.round(total - total / (1 + VAT_RATE)),
    requested,
    /** Lines only: positive when the quote costs more than the request. */
    difference: subtotal - requested,
  };
}

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
