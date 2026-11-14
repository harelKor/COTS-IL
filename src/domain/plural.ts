/**
 * Hebrew counts (A-04). One takes the singular noun and the number word after it ("פריט
 * אחד", "הזמנה אחת"); everything else takes the plural with digits ("2 פריטים"). The compact
 * form keeps the digit for one ("1 פריט"), for dense lines such as an admin card.
 */
export type Noun = { one: string; many: string; gender: "m" | "f" };

export const ITEM: Noun = { one: "פריט", many: "פריטים", gender: "m" };
export const ORDER: Noun = { one: "הזמנה", many: "הזמנות", gender: "f" };
export const UNIT: Noun = { one: "יחידה", many: "יחידות", gender: "f" };
export const LINE: Noun = { one: "שורה", many: "שורות", gender: "f" };
export const PRODUCT: Noun = { one: "מוצר", many: "מוצרים", gender: "m" };

const number = (n: number) => n.toLocaleString("he-IL");

export function countOf(n: number, noun: Noun, style: "words" | "compact" = "words"): string {
  if (n === 1) return style === "compact" ? `1 ${noun.one}` : `${noun.one} ${noun.gender === "f" ? "אחת" : "אחד"}`;
  return `${number(n)} ${noun.many}`;
}

/** Units in the short form a table or card uses: "2 יח׳", the same for one and for many. */
export const units = (n: number) => `${number(n)} יח׳`;
