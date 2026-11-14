import type { Business } from "./settings";
import { whatsappHref } from "./settings";

/**
 * The site's link lists: the info pages (side nav, sitemap) and the footer's columns. Pure, so the
 * grouping and the contact buttons are tested without rendering.
 */

/** The info pages in reading order, as the side nav lists them. */
export const INFO_LINKS = [
  { href: "/how-it-works", label: "איך זה עובד" },
  { href: "/faq", label: "שאלות נפוצות" },
  { href: "/shipping", label: "משלוח וזמני אספקה" },
  { href: "/returns", label: "החזרות" },
  { href: "/terms", label: "תנאי שימוש" },
  { href: "/privacy", label: "פרטיות" },
  { href: "/about", label: "מי אנחנו" },
  { href: "/contact", label: "צור קשר" },
] as const;

export type FooterLink = { href: string; label: string };
export type FooterColumn = { title: string; links: FooterLink[] };

/**
 * The footer's three fixed columns; the fourth, "צרו קשר", is built from the business facts.
 * "הצהרת נגישות" joins העסק when its page exists (audit T8).
 */
export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "קנייה",
    links: [
      { href: "/catalog", label: "קטלוג" },
      { href: "/#vendors", label: "ספקים" },
      { href: "/how-it-works", label: "איך זה עובד" },
    ],
  },
  {
    title: "עזרה",
    links: [
      { href: "/faq", label: "שאלות נפוצות" },
      { href: "/shipping", label: "משלוח" },
      { href: "/returns", label: "החזרות" },
    ],
  },
  {
    title: "העסק",
    links: [
      { href: "/about", label: "מי אנחנו" },
      { href: "/terms", label: "תנאים" },
      { href: "/privacy", label: "פרטיות" },
    ],
  },
];

/** A Google Maps search for the pickup address. */
export function mapHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export type ContactButton = {
  key: "whatsapp" | "email" | "phone" | "address";
  label: string;
  /** The value shown under the label, kept as typed (the page puts it in <Ltr> where it's Latin or digits). */
  value: string;
  href: string;
  external: boolean;
  /** Whether the value is digits or an address in Latin script. */
  ltr: boolean;
};

/** The contact buttons for the fields that are filled in, in order; none for an empty field. */
export function contactButtons(
  business: Pick<Business, "email" | "phone" | "whatsapp" | "pickupAddress">,
): ContactButton[] {
  const out: ContactButton[] = [];
  const wa = whatsappHref(business.whatsapp);
  if (wa && business.whatsapp)
    out.push({ key: "whatsapp", label: "וואטסאפ", value: `+${business.whatsapp}`, href: wa, external: true, ltr: true });
  if (business.email)
    out.push({ key: "email", label: "דוא״ל", value: business.email, href: `mailto:${business.email}`, external: false, ltr: true });
  if (business.phone)
    out.push({
      key: "phone",
      label: "טלפון",
      value: business.phone,
      href: `tel:${business.phone.replace(/[^\d+]/g, "")}`,
      external: false,
      ltr: true,
    });
  if (business.pickupAddress)
    out.push({
      key: "address",
      label: "כתובת האיסוף",
      value: business.pickupAddress,
      href: mapHref(business.pickupAddress),
      external: true,
      ltr: false,
    });
  return out;
}
