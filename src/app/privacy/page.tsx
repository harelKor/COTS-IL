import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info-page";

export const metadata: Metadata = { title: "פרטיות", description: "איזה מידע COTS-IL שומר ולמה." };

export default function PrivacyPage() {
  return (
    <InfoPage title="פרטיות">
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
        <p>אפשר להסיר כתובת דוא״ל מחשבון הקבוצה בעמוד הקבוצה. למחיקת החשבון כולו, צרו קשר.</p>
      </InfoSection>
    </InfoPage>
  );
}
