import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection } from "@/components/info-page";
import { contactChannels } from "@/domain/go-live";
import { getBusiness } from "@/lib/settings";

export const metadata: Metadata = { title: "פרטיות", description: "איזה מידע COTS-IL שומר ולמה." };

export default async function PrivacyPage() {
  // "Contact us" only where there is a way to: otherwise the message goes in an order's page.
  const hasContact = contactChannels(await getBusiness()).length > 0;
  return (
    <InfoPage title="פרטיות" path="/privacy">
      <InfoSection title="מה נשמר">
        <p>שם הקבוצה ומספרה, כתובות הדוא״ל שמתחברות לחשבון הקבוצה, פרטי מסירה, הסל, הבקשות וההזמנות.</p>
        <p>סל של מי שלא מחובר/ת נשמר רק בדפדפן שלו/ה.</p>
      </InfoSection>
      <InfoSection title="למה">
        <p>כדי לתמחר, להזמין מהספקים, למסור לקבוצה ולעדכן אותה על ההזמנה. המידע לא נמכר ולא משמש לפרסום.</p>
      </InfoSection>
      <InfoSection title="איפה">
        <p>הנתונים שמורים במסד נתונים מאובטח באירופה, עם גיבוי מוצפן כל לילה. לספקים בחו״ל עוברים רק פרטי ההזמנה שהם צריכים.</p>
      </InfoSection>
      <InfoSection title="מחיקה">
        <p>
          אפשר להסיר כתובת דוא״ל מחשבון הקבוצה בעמוד הקבוצה. למחיקת החשבון כולו,{" "}
          {hasContact ? (
            <Link href="/contact" className="text-brand hover:underline">
              צרו קשר
            </Link>
          ) : (
            <>
              כתבו בדף ההזמנה של הקבוצה (
              <Link href="/orders" className="text-brand hover:underline">
                ההזמנות
              </Link>
              )
            </>
          )}
          .
        </p>
      </InfoSection>
    </InfoPage>
  );
}
