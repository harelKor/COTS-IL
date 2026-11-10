import type { Metadata } from "next";
import { InfoPage, InfoSection } from "@/components/info-page";
import { Ltr } from "@/components/ltr";
import { business } from "@/lib/business";

export const metadata: Metadata = { title: "מי אנחנו", description: "COTS-IL: רכש ציוד FRC ו-FTC לקבוצות בישראל." };

export default function AboutPage() {
  return (
    <InfoPage title="מי אנחנו">
      <InfoSection title="COTS-IL">
        <p>
          COTS-IL הוא פורטל רכש לקבוצות <Ltr>FIRST</Ltr> בישראל. במקום שכל קבוצה תזמין לבד מכמה אתרים בחו״ל, בדולרים ובכמה משלוחים, בונים כאן סל אחד
          מ-<Ltr>AndyMark</Ltr>, <Ltr>WCP</Ltr>, <Ltr>CTRE</Ltr> ו-<Ltr>The Thrifty Bot</Ltr>, ואנחנו מזמינים, מרכזים ומוסרים.
        </p>
        <p>הקטלוג מתעדכן מאתרי הספקים כל לילה, כך שהמחירים והזמינות קרובים למה שהספק מציג.</p>
      </InfoSection>
      {(business.legalName || business.companyNumber) && (
        <InfoSection title="פרטי העסק">
          {business.legalName && <p>{business.legalName}</p>}
          {business.companyNumber && (
            <p>
              ח.פ. <Ltr>{business.companyNumber}</Ltr>
            </p>
          )}
        </InfoSection>
      )}
    </InfoPage>
  );
}
