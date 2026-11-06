/**
 * Moving carts around without an account: share links and pasted lists.
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

export type PastedLine = { sku: string; qty: number };

/**
 * A pasted list or a BOM CSV: one part per line, a SKU and an optional quantity.
 * Accepts "WCP-0749, 4", "WCP-0749\t4", "4 x WCP-0749", "4x WCP-0749" and a bare
 * SKU (quantity 1). A header row and blank lines are skipped. Repeats add up.
 */
export function parsePastedList(text: string): { lines: PastedLine[]; skipped: string[] } {
  const bySku = new Map<string, PastedLine>();
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/).slice(0, 500)) {
    const row = raw.trim();
    if (!row) continue;
    const cells = row
      .split(/[,;\t]/)
      .map((c) => c.trim().replace(/^"(.*)"$/, "$1"))
      .filter(Boolean);
    let sku: string | undefined;
    let qty = 1;
    const leading = row.match(/^(\d{1,4})\s*[x×*]?\s+(\S+)$/i);
    if (cells.length >= 2) {
      const numeric = cells.findIndex((c) => /^\d{1,4}$/.test(c));
      if (numeric !== -1) {
        qty = Number(cells[numeric]);
        sku = cells.find((c, i) => i !== numeric);
      } else sku = cells[0];
    } else if (leading) {
      qty = Number(leading[1]);
      sku = leading[2];
    } else sku = cells[0];

    if (!sku || !/\d/.test(sku) || sku.length > 40 || /^(sku|part|item|qty|quantity|מק״ט|כמות)$/i.test(sku) || qty < 1) {
      if (!/^(sku|part|item|qty|quantity|מק״ט|כמות)\b/i.test(row)) skipped.push(row);
      continue;
    }
    const key = sku.toUpperCase();
    const existing = bySku.get(key);
    bySku.set(key, { sku: existing?.sku ?? sku, qty: Math.min((existing?.qty ?? 0) + qty, MAX_QTY) });
  }
  return { lines: [...bySku.values()], skipped };
}
