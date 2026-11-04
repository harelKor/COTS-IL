import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth";
import { getFacets } from "@/lib/catalog";
import { catalogHref } from "@/lib/catalog-filters";

/** Browsing is open to everyone, so a team waiting for approval just gets a reminder. */
async function TeamNotice() {
  const viewer = await getViewer();
  if (!viewer || viewer.isAdmin || viewer.teams.some((t) => t.status === "active") || viewer.teams.length === 0) {
    return null;
  }
  return (
    <Link href="/pending" className="block rounded-lg border border-warning bg-surface p-3 text-sm hover:bg-subtle">
      הקבוצה שלכם עדיין לא אושרה. אפשר לעיין בקטלוג, ולהזמין אחרי אישור הספק הישראלי.
    </Link>
  );
}

async function Browse() {
  const { categories, suppliers } = await getFacets();

  return (
    <>
      <section>
        <h2 className="mb-3 font-semibold">קטגוריות</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={catalogHref({ category: c.slug })}
                className="flex h-full flex-col rounded-lg border border-line bg-surface p-4 hover:border-brand"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted">{c.count.toLocaleString("he-IL")} מוצרים</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">ספקים</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {suppliers.map((s) => (
            <li key={s.code}>
              <Link
                href={catalogHref({ supplier: s.code })}
                className="flex h-full flex-col rounded-lg border border-line bg-surface p-4 hover:border-brand"
              >
                <span className="ltr font-medium">{s.name}</span>
                <span className="text-xs text-muted">{s.count.toLocaleString("he-IL")} מוצרים</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense>
        <TeamNotice />
      </Suspense>

      <section className="py-6 text-center">
        <h1 className="mb-3 text-3xl font-bold">
          ציוד <span className="ltr">FRC</span> ו-<span className="ltr">FTC</span> מכל הספקים, בהזמנה אחת
        </h1>
        <p className="mx-auto mb-6 max-w-xl text-muted">
          מחפשים מוצרים, רואים מחיר בשקלים כולל מע״מ, ושולחים סל לספק הישראלי. הספק הישראלי מזמין מהספקים, מרכז ומוסר לקבוצה.
          ההרשמה נדרשת רק כשמזמינים.
        </p>
        <Form action="/catalog" className="mx-auto flex max-w-xl gap-2">
          <input
            type="search"
            name="q"
            placeholder="חיפוש לפי שם או מק״ט"
            aria-label="חיפוש"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 py-2.5"
          />
          <button className="rounded-md bg-brand px-5 py-2.5 text-white hover:bg-brand-strong">חיפוש</button>
        </Form>
      </section>

      <Suspense fallback={<p className="text-muted">טוען…</p>}>
        <Browse />
      </Suspense>
    </div>
  );
}
