type Line = { qty: number; unitPriceIls: number; requestedQty: number; requestedPrice: number };

/**
 * The quote editor's totals above Send: subtotal, shipping, the total, and how far it
 * moved from what the team asked for (the request has no shipping). Prices carry no
 * VAT (user decision, Nov 10, 2026; prices are USD × rate × 1.6), so there is no VAT line.
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
    requested,
    /** Lines only: positive when the quote costs more than the request. */
    difference: subtotal - requested,
  };
}

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
