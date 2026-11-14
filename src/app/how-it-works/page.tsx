import type { Metadata } from "next";
import Link from "next/link";
import { HowItWorksSteps } from "@/components/how-it-works-steps";
import { InfoPage, InfoSection } from "@/components/info-page";
import { Ltr } from "@/components/ltr";
import { VendorNames } from "@/components/vendor-names";
import { getFacets } from "@/lib/catalog";
import { getBusiness } from "@/lib/settings";

export const metadata: Metadata = {
  title: "איך זה עובד",
  description: "מסל אחד מכל הספקים ועד מסירה לקבוצה: ארבעה שלבים, ומי עושה מה בכל אחד.",
};

export default async function HowItWorksPage() {
  const [business, { suppliers }] = await Promise.all([getBusiness(), getFacets()]);
  return (
    <InfoPage
      title="איך זה עובד"
      intro={
        <>
          COTS-IL מרכז ציוד <Ltr>FRC</Ltr> ו-<Ltr>FTC</Ltr> מ-<VendorNames names={suppliers.map((s) => s.name)} />. הקבוצה בונה סל ושולחת בקשה, והספק הישראלי
          מזמין מכל ספק, מרכז ומוסר.
        </>
      }
    >
      <HowItWorksSteps />
      <InfoSection title="מה הקבוצה עושה">
        <p>בונה סל, נכנסת לחשבון הקבוצה ושולחת בקשה להצעת מחיר, ואז מאשרת או דוחה את ההצעה.</p>
        <p>
          לכל קבוצה יש חשבון אחד. כל מי שמחובר/ת אליו יכול/ה לבנות את הסל, לשלוח, לאשר, לבטל ולנהל את פרטי הקבוצה. אפשר להשתמש בכתובת דוא״ל משותפת
          אחת או בכמה כתובות, וכולן שוות.
        </p>
        <p>קבוצה חדשה יכולה לשלוח בקשה ראשונה מיד: הספק הישראלי מאשר את הקבוצה יחד איתה.</p>
      </InfoSection>
      <InfoSection title="מה הספק הישראלי עושה">
        <p>
          בודק כל בקשה מול המחיר והזמינות העדכניים אצל הספק, מוסיף משלוח בישראל ושולח הצעת מחיר
          {business.quoteLeadBusinessDays ? ` תוך ${business.quoteLeadBusinessDays} ימי עסקים` : ""}. שינוי במחיר או בכמות מגיע עם הסבר.
        </p>
        <p>אחרי האישור: מזמין מכל ספק, מטפל במשלוח וביבוא, קולט את הסחורה ומוסר לקבוצה עם תעודת משלוח.</p>
      </InfoSection>
      <InfoSection title="איפה רואים מה קורה">
        <p>
          בדף{" "}
          <Link href="/orders" className="text-brand hover:underline">
            ההזמנות
          </Link>{" "}
          כל הזמנה מראה איפה היא: מחכה להצעת מחיר, הצעה לאישורכם, אושרה, הוזמנה מהספק, בדרך למחסן, במחסן, מוכנה למסירה, נמסרה.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
