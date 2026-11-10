import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info-page";
import { Ltr } from "@/components/ltr";
import { leadTimeText } from "@/domain/lead-time";
import { business } from "@/lib/business";

export const metadata: Metadata = {
  title: "משלוח וזמני אספקה",
  description: "מה כלול במחיר, זמני אספקה לפי ספק, ומסירה בישראל.",
};

const SUPPLIERS = [
  { code: "andymark", name: "AndyMark" },
  { code: "wcp", name: "WCP" },
  { code: "ctre", name: "CTRE" },
  { code: "ttb", name: "The Thrifty Bot" },
];

export default function ShippingPage() {
  const leads = SUPPLIERS.flatMap((s) => {
    const text = leadTimeText(business.leadTimes[s.code]);
    return text ? [{ ...s, text }] : [];
  });
  return (
    <InfoPage title="משלוח וזמני אספקה">
      <InfoSection title="מה כלול במחיר">
        <p>
          המחיר בקטלוג הוא מחיר הספק בדולרים, כפול השער היציג של בנק ישראל (מתעדכן כל יום). הוא בשקלים וכולל
          מע״מ{business.priceIncludes ? ` ו${business.priceIncludes}` : ""}.
        </p>
        <p>משלוח בתוך ישראל מתומחר בנפרד בהצעת המחיר. המחיר המחייב הוא זה שבהצעה שאישרתם.</p>
        {business.handlingFee && <p>{business.handlingFee}.</p>}
      </InfoSection>
      <InfoSection title="זמני אספקה">
        <p>הספירה מתחילה כשהקבוצה מאשרת את ההצעה. אנחנו מזמינים מכל ספק ומאחדים הזמנות של כמה קבוצות למשלוח אחד.</p>
        {leads.length > 0 && (
          <ul className="flex flex-col gap-1">
            {leads.map((l) => (
              <li key={l.code} className="flex justify-between gap-3">
                <Ltr>{l.name}</Ltr>
                <span className="text-muted tabular-nums">{l.text}</span>
              </li>
            ))}
          </ul>
        )}
        <p>פריט שלא זמין אצל הספק מסומן בהצעה, ואפשר להסיר אותו לפני האישור.</p>
      </InfoSection>
      <InfoSection title="מסירה">
        <p>כשהחלקים מגיעים אנחנו בודקים כמויות ופגמים ומוסרים לקבוצה עם תעודת משלוח. דף ההזמנה מראה מה כבר נמסר ומה עוד בדרך.</p>
        {business.pickupAddress && (
          <p>
            איסוף עצמי: {business.pickupAddress}
            {business.pickupHours ? `, ${business.pickupHours}` : ""}.
          </p>
        )}
      </InfoSection>
    </InfoPage>
  );
}
