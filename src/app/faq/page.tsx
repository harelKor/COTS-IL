import type { Metadata } from "next";
import { InfoTextPage } from "@/components/info-text-page";

export const metadata: Metadata = {
  title: "שאלות נפוצות",
  description: "מחירים, הצעות מחיר, חשבון הקבוצה וזמני אספקה ב-BLUEHUB.",
};

/** The text is the admin's (הגדרות, תוכן האתר); the facts come from פרטי העסק. */
export default function FaqPage() {
  return <InfoTextPage page="faq" />;
}
