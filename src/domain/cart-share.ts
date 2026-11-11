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

/** The query parameter a sign-in link carries the guest's cart in, so it comes back in any browser. */
export const PENDING_CART_PARAM = "pending";

/** `next` with the guest's cart added, so signing in from another browser (or the installed app) still finds it. */
export function withPendingCart(next: string, lines: SharedLine[]): string {
  const encoded = encodeCart(lines);
  if (!encoded) return next;
  const [path, hash = ""] = next.split("#");
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(PENDING_CART_PARAM, encoded);
  // URLSearchParams escapes "~"; the cart reads fine either way, but this keeps links short.
  return `${base}?${params.toString().replace(/%7E/gi, "~")}${hash ? `#${hash}` : ""}`;
}

/** The cart a sign-in link brought back, and the address without it. */
export function takePendingCart(url: URL): { lines: SharedLine[]; cleaned: string } | null {
  const value = url.searchParams.get(PENDING_CART_PARAM);
  if (value === null) return null;
  const copy = new URL(url);
  copy.searchParams.delete(PENDING_CART_PARAM);
  return { lines: decodeCart(value), cleaned: `${copy.pathname}${copy.search}${copy.hash}` };
}
