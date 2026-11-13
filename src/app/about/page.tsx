import type { Metadata } from "next";
import { InfoTextPage } from "@/components/info-text-page";

export const metadata: Metadata = { title: "מי אנחנו", description: "COTS-IL: רכש ציוד FRC ו-FTC לקבוצות בישראל." };

/** The text is the admin's (הגדרות, תוכן האתר); the facts come from פרטי העסק. */
export default function AboutPage() {
  return <InfoTextPage page="about" />;
}
