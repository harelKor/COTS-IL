import type { Metadata } from "next";
import { InfoTextPage } from "@/components/info-text-page";

export const metadata: Metadata = { title: "פרטיות", description: "איזה מידע COTS-IL שומר ולמה." };

/** The text is the admin's (הגדרות, תוכן האתר); the facts come from פרטי העסק. */
export default function PrivacyPage() {
  return <InfoTextPage page="privacy" />;
}
