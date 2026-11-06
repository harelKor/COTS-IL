/**
 * Moving carts around without an account: share links.
 */

export type SharedLine = { variantId: string; qty: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_SHARED_LINES = 100;
const MAX_QTY = 9999;

/** A cart in a URL parameter: "<uuid>.<qty>~<uuid>.<qty>". Short enough for WhatsApp, no database needed. */
export function encodeCart(lines: SharedLine[]): string {
  return lines
    .filter((l) => UUID.test(l.variantId) && l.qty > 0)
    .slice(0, MAX_SHARED_LINES)
    .map((l) => `${l.variantId.toLowerCase()}.${Math.min(Math.round(l.qty), MAX_QTY)}`)
    .join("~");
}

/** Reads a shared cart, skipping anything malformed and merging repeats. */
export function decodeCart(value: string | null | undefined): SharedLine[] {
  const byId = new Map<string, number>();
  for (const part of (value ?? "").split("~").slice(0, MAX_SHARED_LINES)) {
    const [id, qtyText] = part.split(".");
    const qty = Number(qtyText);
    if (!id || !UUID.test(id) || !Number.isInteger(qty) || qty < 1) continue;
    const key = id.toLowerCase();
    byId.set(key, Math.min((byId.get(key) ?? 0) + qty, MAX_QTY));
  }
  return [...byId].map(([variantId, qty]) => ({ variantId, qty }));
}
