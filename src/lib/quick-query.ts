export const MAX_QTY = 9999;

export type QuickQuery = {
  /** The whole query, tidied. */
  text: string;
  /** The search text without the quantity. */
  q: string;
  qty: number;
  /** The "x4" token, when there was one. */
  token: string | null;
};

/**
 * Splits a search-panel query into the search text and a quantity. A trailing
 * "x4" (or "×4") sets the quantity, so "htd pulley x4" searches "htd pulley" for 4.
 * Some part names end the same way ("Kraken X60"); resolveQuickQuery sorts those out.
 */
export function parseQuickQuery(input: string): QuickQuery {
  const text = input.trim().replace(/\s+/g, " ");
  const match = text.match(/^(.*\S)\s+([x×*](\d{1,4}))$/i);
  if (!match) return { text, q: text, qty: 1, token: null };
  const qty = Number(match[3]);
  return { text, q: match[1], qty: Math.min(Math.max(qty, 1), MAX_QTY), token: match[2] };
}

/**
 * True when the "x4" token is really part of a product name in the results, like
 * the X60 in "Kraken X60", so the whole text should be searched with a quantity of 1.
 */
export function tokenIsPartName(token: string, titles: string[]): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${token.replace(/[×*]/, "x")}($|[^a-z0-9])`, "i");
  return titles.some((t) => pattern.test(t));
}

/** One spelling per search, so "Falcon  500" and "falcon 500" share a cache entry. */
export function normalizeSearch(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 100);
}
