import type { Metadata } from "next";
import { InfoTextPage } from "@/components/info-text-page";

export const metadata: Metadata = { title: "החזרות", description: "פריט פגום, חסר או לא נכון: מה עושים." };

/** The text is the admin's (הגדרות, תוכן האתר); the facts come from פרטי העסק. */
export default function ReturnsPage() {
  return <InfoTextPage page="returns" />;
}
