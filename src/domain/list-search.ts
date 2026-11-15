/**
 * Typing to narrow a list of values: the product page's option picker (OptionCombobox) and the
 * catalog's long filter lists (CF2) match the same way.
 */

/** Lower case, one space between words: "  1/2\"  HEX " → "1/2\" hex". */
export function foldText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The items whose text holds what was typed; all of them for an empty search. */
export function matchList<T>(items: readonly T[], query: string, text: (item: T) => string): T[] {
  const q = foldText(query);
  return q ? items.filter((item) => foldText(text(item)).includes(q)) : [...items];
}
