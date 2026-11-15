/**
 * How many come in one order line, when the title says so (P2-6): "Qty. 10", "QTY 5 - …",
 * "10 Pack", "(6-Pack)", "- 2 Pack", "Pack of 25", "25pk". Never guessed: a title that doesn't
 * state a number gives null, and so does one (a "QTY 1" sprocket is one sprocket).
 */
const PATTERNS = [/\bqty\.?:?\s*(\d{1,5})\b/i, /\b(\d{1,5})\s*-?\s*packs?\b/i, /\bpack\s+of\s+(\d{1,5})\b/i, /\b(\d{1,5})\s*-?\s*pk\b/i];

export function packSize(title: string): number | null {
  for (const pattern of PATTERNS) {
    const m = pattern.exec(title);
    if (!m) continue;
    const n = Number(m[1]);
    return n > 1 ? n : null;
  }
  return null;
}

/** Beside the price on a card: "חבילה של 10". */
export const packText = (n: number) => `חבילה של ${n.toLocaleString("he-IL")}`;
