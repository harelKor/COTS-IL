/**
 * Morning (חשבונית ירוקה) document numbers, typed in by hand (Nov 24, 2026): the owner's Morning
 * plan has no API, so the admin issues each document in Morning and types its number here.
 *  - quotes.morning_quote_no: the הצעת מחיר (e.g. 434);
 *  - quotes.morning_deal_no: the חשבון עסקה (e.g. 40100);
 *  - payments.morning_doc_no: the חשבונית מס/קבלה (e.g. 1023).
 * Digits only (the DB checks the same). An empty field clears the number.
 */

export const MORNING_LABEL = {
  quote: "הצעת מחיר",
  deal: "חשבון עסקה",
  receipt: "חשבונית מס/קבלה",
} as const;

/** Spaces, dashes and a leading "#" or "מס׳" people paste are dropped; what's left must be 1–12 digits. */
export function parseMorningNo(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const raw = typeof input === "string" ? input : input === null || input === undefined ? "" : String(input);
  const s = raw
    .trim()
    .replace(/^(מס['׳]?|#)\s*/, "")
    .replace(/[\s-]/g, "");
  if (s === "") return { ok: true, value: null };
  if (!/^\d{1,12}$/.test(s)) return { ok: false, error: "מספר מסמך בחשבונית ירוקה הוא ספרות בלבד" };
  return { ok: true, value: s };
}

/**
 * The team's "מסמכים" line on /orders/<id>: "הצעת מחיר 434, חשבון עסקה 40100, חשבונית מס/קבלה 1023".
 * Null while there is no number to show.
 */
export function documentsLine(docs: { quoteNo: string | null; dealNo: string | null; receipts: (string | null)[] }): string | null {
  const parts: string[] = [];
  if (docs.quoteNo) parts.push(`${MORNING_LABEL.quote} ${docs.quoteNo}`);
  if (docs.dealNo) parts.push(`${MORNING_LABEL.deal} ${docs.dealNo}`);
  const receipts = [...new Set(docs.receipts.filter((r): r is string => !!r))].sort((a, b) => Number(a) - Number(b));
  if (receipts.length) parts.push(`${MORNING_LABEL.receipt} ${receipts.join(", ")}`);
  return parts.length ? parts.join(", ") : null;
}

/** The numbers worth showing for an order: the newest quote version that has any. */
export function morningQuoteNumbers<T extends { version: number; morningQuoteNo: string | null; morningDealNo: string | null }>(quotes: T[]) {
  const withNumbers = quotes.filter((q) => q.morningQuoteNo || q.morningDealNo).sort((a, b) => b.version - a.version);
  return { quoteNo: withNumbers.find((q) => q.morningQuoteNo)?.morningQuoteNo ?? null, dealNo: withNumbers.find((q) => q.morningDealNo)?.morningDealNo ?? null };
}
