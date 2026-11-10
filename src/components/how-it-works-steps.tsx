import { ClipboardCheck, PackageCheck, Send, ShoppingCart } from "lucide-react";

export const HOW_STEPS = [
  { icon: ShoppingCart, title: "בונים סל", text: "מחפשים חלקים מכל הספקים ומוסיפים לסל אחד. בלי הרשמה ובלי תשלום." },
  { icon: Send, title: "שולחים בקשה", text: "נכנסים לחשבון הקבוצה ושולחים את הסל כבקשה להצעת מחיר. זה לא מחייב." },
  { icon: ClipboardCheck, title: "מאשרים הצעה", text: "הספק הישראלי בודק מחיר וזמינות עדכניים, מוסיף משלוח בישראל ושולח הצעה. מאשרים באתר או מקישור." },
  { icon: PackageCheck, title: "מקבלים", text: "אנחנו מזמינים מכל ספק, מרכזים את המשלוחים ומוסרים לקבוצה עם תעודת משלוח. הסטטוס מתעדכן בדף ההזמנה." },
] as const;

/** The order flow in four steps, on the home page and on /how-it-works. */
export function HowItWorksSteps() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {HOW_STEPS.map((s, i) => (
        <li key={s.title} className="card-surface flex flex-col gap-2 rounded-card p-5">
          <span className="flex items-center gap-2">
            <span className="btn-brand flex size-8 items-center justify-center rounded-full text-caption font-bold tabular-nums">{i + 1}</span>
            <s.icon size={20} strokeWidth={1.75} aria-hidden className="text-brand" />
          </span>
          <h3 className="text-[17px] font-semibold">{s.title}</h3>
          <p className="text-caption leading-relaxed text-muted">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
