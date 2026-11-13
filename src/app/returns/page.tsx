import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection } from "@/components/info-page";
import { getBusiness } from "@/lib/settings";

export const metadata: Metadata = { title: "החזרות", description: "פריט פגום, חסר או לא נכון: מה עושים." };

export default async function ReturnsPage() {
  const business = await getBusiness();
  return (
    <InfoPage title="החזרות">
      <InfoSection title="פריט פגום או חסר">
        <p>כל משלוח נבדק כשהוא מגיע אלינו: יחידות פגומות לא נמסרות, ומה שחסר נשאר פתוח בהזמנה עד שהוא מגיע.</p>
        <p>
          קיבלתם משהו פגום, חסר או לא נכון?{" "}
          <Link href="/contact" className="text-brand hover:underline">
            כתבו לנו
          </Link>{" "}
          עם מספר ההזמנה ונטפל.
        </p>
      </InfoSection>
      {business.returnPolicy && (
        <InfoSection title="מדיניות החזרות">
          <p>{business.returnPolicy}</p>
        </InfoSection>
      )}
    </InfoPage>
  );
}
