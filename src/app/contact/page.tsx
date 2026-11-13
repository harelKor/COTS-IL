import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info-page";
import { Ltr } from "@/components/ltr";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { getBusiness } from "@/lib/settings";

export const metadata: Metadata = { title: "צור קשר", description: "איך מגיעים לאדם ב-COTS-IL." };

export default async function ContactPage() {
  const business = await getBusiness();
  const any = business.email || business.phone || business.whatsapp || business.pickupAddress;
  return (
    <InfoPage title="צור קשר" intro="שאלה על חלק, על הצעה או על הזמנה? צרפו את מספר ההזמנה אם יש.">
      <InfoSection title="דרכי קשר">
        {business.email && (
          <p>
            דוא״ל:{" "}
            <a href={`mailto:${business.email}`} className="text-brand hover:underline">
              <Ltr>{business.email}</Ltr>
            </a>
          </p>
        )}
        {business.phone && (
          <p>
            טלפון:{" "}
            <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`} className="text-brand hover:underline">
              <Ltr>{business.phone}</Ltr>
            </a>
          </p>
        )}
        {business.pickupAddress && (
          <p>
            כתובת: {business.pickupAddress}
            {business.pickupHours ? `, ${business.pickupHours}` : ""}
          </p>
        )}
        <WhatsAppLink />
        {!any && <p>על כל בקשה ששלחתם עונים בדף ההזמנה שלה, יחד עם הצעת המחיר.</p>}
      </InfoSection>
    </InfoPage>
  );
}
