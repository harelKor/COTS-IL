import type { Metadata } from "next";
import { InfoTextPage } from "@/components/info-text-page";

export const metadata: Metadata = { title: "תנאי שימוש", description: "תנאי השימוש ב-BLUEHUB." };

/** The text is the admin's (הגדרות, תוכן האתר); the facts come from פרטי העסק. */
export default function TermsPage() {
  return <InfoTextPage page="terms" />;
}
