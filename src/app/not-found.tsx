import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

export const metadata: Metadata = {
  title: "הדף לא נמצא",
  robots: { index: false },
};

/**
 * No database reads here: the root not-found boundary is part of every route's payload,
 * so a query in it runs on every page and prefetch (the admin hangs of Nov 10, 2026).
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-8 py-12 text-center">
      <div>
        <p className="mb-2 text-caption text-muted">שגיאה 404</p>
        <h1 className="mb-3 text-hero-sm font-semibold">הדף לא נמצא</h1>
        <p className="text-muted">ייתכן שהקישור ישן או שהמוצר כבר לא נמכר אצל הספק. נסו לחפש אותו.</p>
      </div>
      <Form action="/catalog" className="flex w-full max-w-xl gap-2">
        <input
          type="search"
          name="q"
          placeholder="חיפוש לפי שם או מק״ט"
          aria-label="חיפוש"
          className="h-12 min-w-0 flex-1 rounded-full bg-surface px-5 shadow-lift"
        />
        <button className="h-12 rounded-full bg-brand px-6 text-white hover:bg-brand-strong">חיפוש</button>
      </Form>
      <Link href="/catalog" className="flex h-11 items-center rounded-full bg-surface px-5 text-[15px] shadow-lift">
        לכל הקטלוג
      </Link>
      <Link href="/" className="text-brand hover:underline">
        לדף הבית
      </Link>
    </div>
  );
}
