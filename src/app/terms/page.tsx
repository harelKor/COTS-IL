import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info-page";
import { business } from "@/lib/business";

export const metadata: Metadata = { title: "תנאי שימוש", description: "תנאי השימוש ב-COTS-IL." };

export default function TermsPage() {
  return (
    <InfoPage title="תנאי שימוש">
      <InfoSection title="מחירים והצעות">
        <p>המחירים בקטלוג מתעדכנים מאתרי הספקים ומשמשים להערכה. המחיר המחייב הוא זה שבהצעת המחיר שהקבוצה אישרה.</p>
        <p>בקשה להצעת מחיר לא מחייבת. הזמנה נוצרת רק כשהקבוצה מאשרת הצעה, וכל שינוי בהצעה אחר כך צריך אישור מחדש.</p>
        <p>אפשר לבטל בקשה או הצעה כל עוד היא לא אושרה.</p>
      </InfoSection>
      <InfoSection title="חשבון הקבוצה">
        <p>כל מי שמחובר/ת לחשבון הקבוצה פועל/ת בשמה: שולח/ת בקשות, מאשר/ת הצעות ומבטל/ת. הקבוצה אחראית למי שיש לו גישה לחשבון.</p>
      </InfoSection>
      <InfoSection title="זמינות ואספקה">
        <p>זמינות ומחירים אצל הספקים עשויים להשתנות. אם פריט שאושר לא זמין, נעדכן את הקבוצה ונציע חלופה או נוריד אותו מההזמנה.</p>
      </InfoSection>
      {business.paymentTerms && (
        <InfoSection title="תשלום">
          <p>{business.paymentTerms}</p>
        </InfoSection>
      )}
    </InfoPage>
  );
}
