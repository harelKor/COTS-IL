import type { Metadata } from "next";
import { InfoTextPage } from "@/components/info-text-page";

export const metadata: Metadata = { title: "צור קשר", description: "איך מגיעים לאדם ב-COTS-IL." };

/** The text is the admin's (הגדרות, תוכן האתר); the facts come from פרטי העסק. */
export default function ContactPage() {
  return <InfoTextPage page="contact" />;
}
