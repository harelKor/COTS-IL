/**
 * "Ships later" (בהזמנה מראש): the supplier takes the order but has none on hand.
 * Shopify's public JSON says `available: true` for these, so the daily sync reads
 * the product section HTML of the stores that expose it (src/suppliers/stock.ts).
 * We keep only yes/no and the supplier's ETA words, never a quantity.
 */

/** Variant id → ships later, plus the supplier's ETA words when it gives them. */
export type StockReading = { shipsLater: Map<string, boolean>; eta: string | null };

/**
 * WCP's theme writes `global_quantity[<variant>] = '<policy>' + <qty>`. Backorder
 * is policy "continue" with nothing on hand.
 */
export function parseWcpSection(html: string): StockReading {
  const shipsLater = new Map<string, boolean>();
  for (const m of html.matchAll(/global_quantity\[(\d+)\]\s*=\s*'(\w+)'\s*\+\s*(-?\d+)/g)) {
    shipsLater.set(m[1], m[2] === "continue" && Number(m[3]) <= 0);
  }
  return { shipsLater, eta: null };
}

/** CTRE's theme writes `productVariantStockStatus.set("<variant>","Backorder")` and a status line with the ETA. */
export function parseCtreSection(html: string): StockReading {
  const shipsLater = new Map<string, boolean>();
  for (const m of html.matchAll(/productVariantStockStatus\.set\("(\d+)","([^"]*)"\)/g)) {
    shipsLater.set(m[1], /back\s*order|pre-?order/i.test(m[2]));
  }
  const status = html.match(/<\/svg>\s*([^<]{2,120}?)\s*<\/p>/)?.[1] ?? "";
  const eta = status.match(/estimated to ship\s+(.+)$/i)?.[1]?.trim() ?? null;
  return { shipsLater, eta: [...shipsLater.values()].some(Boolean) ? eta : null };
}

const MONTHS: Record<string, string> = {
  january: "ינואר",
  february: "פברואר",
  march: "מרץ",
  april: "אפריל",
  may: "מאי",
  june: "יוני",
  july: "יולי",
  august: "אוגוסט",
  september: "ספטמבר",
  october: "אוקטובר",
  november: "נובמבר",
  december: "דצמבר",
};
const PART: Record<string, string> = { early: "תחילת", mid: "אמצע", late: "סוף", end: "סוף" };

/** "late November" → "סוף נובמבר"; anything else is kept as the supplier wrote it. */
export function etaHebrew(eta: string | null): string | null {
  const text = eta?.trim();
  if (!text) return null;
  const m = text.toLowerCase().match(/^(early|mid|late|end)?(?:\s+of)?\s*([a-z]+)$/);
  const month = m ? MONTHS[m[2]] : undefined;
  if (!m || !month) return text;
  return m[1] ? `${PART[m[1]]} ${month}` : month;
}
