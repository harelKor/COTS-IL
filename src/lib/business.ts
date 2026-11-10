/**
 * Business facts the UI quotes, in one place (docs/IMPROVEMENT-PLAN.md, "Rules
 * for every session"). A value stays null until the business supplies it, and
 * the UI hides the sentence that needs it. Session S4 adds the rest (fees,
 * phone, pickup address, legal name).
 */
export const business = {
  /** Business days from a request to its quote, e.g. 2. Shown after sending: "הצעת מחיר תוך N ימי עסקים". */
  quoteLeadBusinessDays: null as number | null,
};
