import type { Metadata } from "next";
import Link from "next/link";
import { SECTIONS } from "./settings/sections";

export const metadata: Metadata = { title: "הדף לא נמצא", robots: { index: false } };

const MAIN = [
  { href: "/admin", label: "כל ההזמנות" },
  { href: "/admin/purchasing", label: "הזמנות ספקים" },
  { href: "/admin/deliveries", label: "מסירות" },
  { href: "/admin/reports", label: "דוחות" },
  { href: "/admin/teams", label: "קבוצות" },
  { href: "/admin/requests", label: "בקשות חלקים" },
] as const;

const link = "flex min-h-11 items-center rounded-full bg-subtle px-4 text-callout hover:bg-subtle-hover";

/** A mistyped or old admin address: the admin's own sections, not the shop's "the part is no longer sold". No database reads. */
export default function AdminNotFound() {
  return (
    <div className="card-surface mx-auto flex max-w-xl flex-col gap-5 p-8">
      <div>
        <p className="mb-1 text-caption text-muted">שגיאה 404</p>
        <h1 className="text-section font-semibold">הדף הזה לא קיים בניהול</h1>
        <p className="mt-1 text-muted">ייתכן שהכתובת ישנה או שהוקלדה לא נכון. אלה האזורים של הניהול:</p>
      </div>
      <nav aria-label="אזורי הניהול" className="flex flex-col gap-3">
        <ul className="flex flex-wrap gap-2">
          {MAIN.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className={link}>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-caption text-muted">הגדרות</p>
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className={link}>
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
