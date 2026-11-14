import type { Metadata } from "next";
import { InfoTextPage } from "@/components/info-text-page";

export const metadata: Metadata = {
  title: "איך זה עובד",
  description: "מסל אחד מכל הספקים ועד מסירה לקבוצה: ארבעה שלבים, ומי עושה מה בכל אחד.",
};

/** The steps and sections are the admin's text (הגדרות, תוכן האתר); the order's stages come from the status dictionary. */
export default function HowItWorksPage() {
  return <InfoTextPage page="how" />;
}
