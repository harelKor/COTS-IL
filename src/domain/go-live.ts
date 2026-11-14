import type { Business } from "./settings";

/**
 * The go-live checklist on /admin: what the site still lacks before a team can rely on it. Every
 * item is something only the operator can supply (the business facts, the email keys), so each
 * links to the page that sets it. Pure, so it's tested without the settings or the environment.
 */

export type GoLiveItem = {
  key: "contact" | "legalName" | "leadTimes" | "paymentTerms" | "email";
  label: string;
  /** What it affects on the site, in one short sentence. */
  why: string;
  href: string;
};

/** The ways a team can actually reach the business: email, phone, WhatsApp. */
export function contactChannels(business: Pick<Business, "email" | "phone" | "whatsapp">): ("email" | "phone" | "whatsapp")[] {
  const out: ("email" | "phone" | "whatsapp")[] = [];
  if (business.email) out.push("email");
  if (business.phone) out.push("phone");
  if (business.whatsapp) out.push("whatsapp");
  return out;
}

/** Whether the contact page has anything to list (a pickup address counts, it isn't a way to write). */
export function hasContactDetails(business: Pick<Business, "email" | "phone" | "whatsapp" | "pickupAddress">): boolean {
  return contactChannels(business).length > 0 || !!business.pickupAddress;
}

/** Suppliers (by code) with no lead time set. */
export function suppliersWithoutLeadTime(business: Pick<Business, "leadTimes">, supplierCodes: readonly string[]): string[] {
  return supplierCodes.filter((code) => !business.leadTimes[code]);
}

export function goLiveChecklist(input: {
  business: Business;
  /** The vendors shown on the site. */
  supplierCodes: readonly string[];
  /** RESEND_API_KEY and EMAIL_FROM are both set. */
  emailOn: boolean;
}): GoLiveItem[] {
  const { business, supplierCodes, emailOn } = input;
  const items: GoLiveItem[] = [];
  if (contactChannels(business).length === 0)
    items.push({
      key: "contact",
      label: "דרך ליצור קשר",
      why: "עמוד ״צור קשר״, ״כתבו לנו״ בשאלות ובהחזרות וכפתור הוואטסאפ: בלי דוא״ל, טלפון או וואטסאפ אין לקבוצה למי לכתוב",
      href: "/admin/settings/business#email",
    });
  if (!business.legalName)
    items.push({
      key: "legalName",
      label: "שם העסק",
      why: "בתחתית האתר, בעמוד ״מי אנחנו״ ובהצעת המחיר",
      href: "/admin/settings/business#legalName",
    });
  const missing = suppliersWithoutLeadTime(business, supplierCodes);
  if (missing.length > 0)
    items.push({
      key: "leadTimes",
      label: missing.length === supplierCodes.length ? "זמני אספקה" : `זמני אספקה ל-${missing.length} ספקים`,
      why: "בדף המוצר ובעמוד המשלוח: בלי זה אין הבטחת זמן לקבוצה",
      href: "/admin/settings/business#lead-times",
    });
  if (!business.paymentTerms)
    items.push({
      key: "paymentTerms",
      label: "תנאי תשלום",
      why: "בשאלות הנפוצות ובהצעת המחיר",
      href: "/admin/settings/business#paymentTerms",
    });
  if (!emailOn)
    items.push({
      key: "email",
      label: "שליחת מייל (RESEND_API_KEY ו-EMAIL_FROM)",
      why: "עד אז לא יוצאים מיילים על בקשה, הצעה ואישור",
      href: "/admin/settings/system",
    });
  return items;
}
