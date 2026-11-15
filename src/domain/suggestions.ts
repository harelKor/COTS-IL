/** Enough fitting parts to fill the row on their own, so it can say "מתאים לשימוש עם". */
export const FITTING_ROW = 4;
/** Cards in a product page's suggestions row at most. */
export const SUGGESTIONS_MAX = 12;

export type SuggestionRow<T> = { title: string; cards: T[] };

/**
 * The suggestions row under every product: the parts that fit it, then, when they are fewer than
 * FITTING_ROW, more of its category and its vendor's most wanted, each part once and never the
 * part itself. The title stays honest: "מתאים לשימוש עם" only when every card is a fitting part.
 */
export function suggestionRow<T extends { id: string }>(
  selfId: string,
  fitting: T[],
  sameCategory: T[],
  vendorPopular: T[],
): SuggestionRow<T> {
  const seen = new Set([selfId]);
  const take = (list: T[]) => list.filter((c) => !seen.has(c.id) && seen.add(c.id));
  const fits = take(fitting);
  if (fits.length >= FITTING_ROW) return { title: "מתאים לשימוש עם", cards: fits.slice(0, SUGGESTIONS_MAX) };
  const cards = [...fits, ...take(sameCategory), ...take(vendorPopular)].slice(0, SUGGESTIONS_MAX);
  return { title: fits.length > 0 ? "מתאים ומשלים" : "חלקים שכדאי להכיר", cards };
}

/**
 * The cards of an endless sliding row: the list repeated until it has at least `min` cards, so one
 * copy is wider than the screen, then doubled; the track slides by exactly one copy and starts over
 * without a seam. Empty when there are too few parts to loop (the row then stands still).
 */
export function loopCards<T>(cards: T[], min = 8): { base: T[]; loops: boolean } {
  if (cards.length < 3) return { base: cards, loops: false };
  const base: T[] = [];
  while (base.length < min) base.push(...cards);
  return { base, loops: true };
}
