import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { getViewer } from "@/lib/auth";

function Landing() {
  return (
    <section className="py-12 text-center">
      <h1 className="mb-4 text-3xl font-bold">
        ציוד <span className="ltr">FRC</span> ו-<span className="ltr">FTC</span> מכל הספקים, בהזמנה אחת
      </h1>
      <p className="mx-auto mb-8 max-w-xl text-muted">
        בונים סל ממוצרי AndyMark, REV, WCP, CTRE, goBILDA ו-The Thrifty Bot, שולחים למנטור, מקבלים הצעת מחיר סופית
        ומאשרים. המנטור מזמין, מרכז ומוסר לקבוצה.
      </p>
      <div className="flex justify-center gap-3">
        <Link href="/signup" className="rounded-md bg-brand px-5 py-2.5 text-white hover:bg-brand-strong">
          הרשמת קבוצה
        </Link>
        <Link href="/login" className="rounded-md border border-line bg-surface px-5 py-2.5 hover:bg-subtle">
          כניסה
        </Link>
      </div>
    </section>
  );
}

async function Home() {
  const viewer = await getViewer();
  if (!viewer) return <Landing />;
  if (!viewer.isAdmin && !viewer.teams.some((t) => t.status === "active")) redirect("/pending");

  const suppliers = await db
    .select({ code: schema.suppliers.code, name: schema.suppliers.name, programs: schema.suppliers.programs })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.active, true))
    .orderBy(asc(schema.suppliers.name));

  const team = viewer.teams.find((t) => t.status === "active");

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-bold">שלום{viewer.fullName ? `, ${viewer.fullName}` : ""}</h1>
        {team && (
          <p className="text-muted">
            {team.name} · <span className="ltr">{`${team.program} ${team.number}`}</span>
          </p>
        )}
      </section>

      <section className="rounded-lg border border-dashed border-line bg-surface p-6 text-muted">
        הקטלוג, החיפוש והסל יגיעו בשלב הבא (M1). כרגע אפשר לנהל את ההרשמה והקבוצה.
      </section>

      <section>
        <h2 className="mb-3 font-semibold">ספקים</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {suppliers.map((s) => (
            <li key={s.code} className="rounded-lg border border-line bg-surface p-4">
              <div className="ltr font-medium">{s.name}</div>
              <div className="ltr text-xs text-muted">{s.programs.join(" / ")}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<p className="text-muted">טוען…</p>}>
      <Home />
    </Suspense>
  );
}
