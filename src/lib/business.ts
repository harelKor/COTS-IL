/**
 * Business facts the UI quotes, in one place (docs/IMPROVEMENT-PLAN.md, "Rules
 * for every session"). A value stays null until the business supplies it, and
 * the UI hides the sentence that needs it. Never show a placeholder instead.
 */
export type LeadTime = { minDays: number; maxDays: number };

export const business = {
  /** Business days from a request to its quote, e.g. 2. Shown after sending: "הצעת מחיר תוך N ימי עסקים". */
  quoteLeadBusinessDays: null as number | null,
  /** Registered business name, e.g. "קוטס ישראל בע״מ". */
  legalName: null as string | null,
  /** ח.פ. or עוסק מורשה number. */
  companyNumber: null as string | null,
  email: null as string | null,
  /** Shown as written, e.g. "03-1234567". */
  phone: null as string | null,
  /** International digits only, e.g. "972501234567" (used in https://wa.me/<number>). */
  whatsapp: null as string | null,
  pickupAddress: null as string | null,
  /** e.g. "א׳–ה׳ 16:00–19:00". */
  pickupHours: null as string | null,
  /** A sentence about the handling fee, e.g. "דמי טיפול של ₪ 30 להזמנה". */
  handlingFee: null as string | null,
  /** What the ₪ catalog price (USD × 1.6) covers, as one sentence, e.g. "משלוח מארה״ב, מכס ומע״מ". */
  priceIncludes: null as string | null,
  /** Typical days from an approved quote to delivery in Israel, per supplier code. */
  leadTimes: {
    andymark: null,
    wcp: null,
    ctre: null,
    ttb: null,
  } as Record<string, LeadTime | null>,
  /** A short summary of the return policy. */
  returnPolicy: null as string | null,
  /** e.g. "העברה בנקאית או הזמנת רכש של בית הספר, תוך 30 יום". */
  paymentTerms: null as string | null,
};

/** The WhatsApp chat link, or null while there's no number. */
export function whatsappHref(text?: string) {
  if (!business.whatsapp) return null;
  return `https://wa.me/${business.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
