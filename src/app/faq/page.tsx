import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { InfoPage } from "@/components/info-page";
import { Ltr } from "@/components/ltr";
import { business } from "@/lib/business";

export const metadata: Metadata = {
  title: "שאלות נפוצות",
  description: "מחירים, הצעות מחיר, חשבון הקבוצה וזמני אספקה ב-COTS-IL.",
};

const ITEMS: { q: string; a: ReactNode; show?: boolean }[] = [
  {
    q: "האם הוספה לסל או שליחת בקשה מחייבות?",
    a: "לא. הוספה לסל ושליחת בקשה לא מחייבות תשלום. ההזמנה יוצאת לספקים רק אחרי שהקבוצה מאשרת את הצעת המחיר.",
  },
  {
    q: "איך נקבע המחיר בשקלים?",
    a: `המחיר בקטלוג הוא מחיר הספק בדולרים, כפול השער היציג של בנק ישראל (מתעדכן כל יום), כפול 1.6. הוא בשקלים וכולל מע״מ${business.priceIncludes ? ` ו${business.priceIncludes}` : ""}. המקדם 1.6 מכסה גם את הדרך לישראל. משלוח בתוך ישראל מתומחר בהצעת המחיר, והמחיר המחייב הוא זה שבהצעה שאישרתם.`,
  },
  {
    q: "למה לא להזמין ישירות מהספק?",
    a: "כאן יש הזמנה אחת לכל הספקים, מחיר בשקלים כולל מע״מ ומשלוח מרוכז, ואנחנו מטפלים ביבוא. לא צריך כרטיס אשראי בדולרים או לעקוב אחרי כמה משלוחים מחו״ל.",
  },
  {
    q: "מתי מגיעה הצעת המחיר?",
    a: `הספק הישראלי בודק כל בקשה ידנית מול המחיר והזמינות העדכניים${business.quoteLeadBusinessDays ? ` ושולח הצעה תוך ${business.quoteLeadBusinessDays} ימי עסקים` : ""}. ההצעה מופיעה בדף ההזמנה.`,
  },
  {
    q: "מי בקבוצה יכול להזמין ולאשר?",
    a: "כל מי שמחובר/ת לחשבון הקבוצה. אין תפקידים: כולם יכולים לבנות את הסל, לשלוח, לאשר, לבטל ולהוסיף או להסיר כתובות דוא״ל של הקבוצה.",
  },
  { q: "אפשר לבטל?", a: "כן, כל עוד ההצעה עוד לא אושרה, מדף ההזמנה. אחרי האישור ההזמנה יוצאת לספקים." },
  {
    q: "מה פירוש ״זמין״ בקטלוג?",
    a: "הקטלוג מתעדכן מאתרי הספקים כל לילה. ליד כל פריט כתוב אם הוא זמין אצל הספק ומתי זה נבדק, והזמינות נבדקת שוב לפני ההצעה.",
  },
  { q: "איך משלמים?", a: business.paymentTerms, show: !!business.paymentTerms },
  {
    q: "כמה זמן לוקח עד שהחלקים מגיעים?",
    a: (
      <>
        תלוי בספק ובזמינות. הפירוט בעמוד{" "}
        <Link href="/shipping" className="text-brand hover:underline">
          משלוח וזמני אספקה
        </Link>
        .
      </>
    ),
  },
  {
    q: "חסר חלק בקטלוג?",
    a: (
      <>
        כרגע הקטלוג כולל את <Ltr>AndyMark</Ltr>, <Ltr>WCP</Ltr>, <Ltr>CTRE</Ltr> ו-<Ltr>The Thrifty Bot</Ltr>.{" "}
        <Link href="/contact" className="text-brand hover:underline">
          כתבו לנו
        </Link>{" "}
        ונבדוק.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <InfoPage title="שאלות נפוצות">
      <div className="card-surface flex flex-col divide-y divide-line rounded-card px-5 sm:px-6">
        {ITEMS.filter((i) => i.show !== false).map((i) => (
          <details key={i.q} className="group py-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium">
              {i.q}
              <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="pb-3 leading-relaxed text-muted">{i.a}</p>
          </details>
        ))}
      </div>
    </InfoPage>
  );
}
