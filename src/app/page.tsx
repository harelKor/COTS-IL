import Form from "next/form";
import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import { Ltr } from "@/components/ltr";
import { Loading, TileGridSkeleton } from "@/components/skeleton";
import { ReorderButton } from "@/components/reorder-button";
import { canOrder } from "@/domain/orders";
import { formatIls } from "@/domain/pricing";
import { getViewer, orderingTeam } from "@/lib/auth";
import { listOrders } from "@/lib/orders";
import { getFacets } from "@/lib/catalog";
import { catalogHref } from "@/lib/catalog-filters";

/**
 * A signed-in team sees its last order first, with "Order again" (one tap), and a
 * new team a note that its first request will be reviewed with the team.
 */
async function TeamNotice() {
  const viewer = await getViewer();
  const team = viewer && orderingTeam(viewer);
  if (!viewer || viewer.isAdmin || !team) {
    if (viewer && !viewer.isAdmin && viewer.teams.length > 0 && !team) {
      return (
        <Link href="/pending" className="block rounded-card bg-surface p-4 text-sm shadow-lift hover:bg-subtle">
          החשבון של הקבוצה מושהה. פרטים בעמוד הקבוצה.
        </Link>
      );
    }
    return null;
  }
  const [last] = await listOrders(team.id);
  return (
    <div className="flex flex-col gap-3">
      {team.status === "pending" && (
        <p className="rounded-card bg-surface p-4 text-sm shadow-lift">
          הקבוצה חדשה וממתינה לאישור. אפשר כבר לבנות סל ולשלוח בקשה ראשונה: הספק הישראלי יאשר את הקבוצה יחד איתה.
        </p>
      )}
      {last && canOrder(team.role) && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 shadow-lift">
          <Link href={`/orders/${last.id}`} className="min-w-0 hover:text-brand">
            <span className="block font-medium">ההזמנה האחרונה: מס׳ {last.number}</span>
            <span className="block text-caption text-muted">
              {last.lineCount} שורות · {formatIls(last.quoteTotal ?? last.requestTotal)}
            </span>
          </Link>
          <ReorderButton orderId={last.id} />
        </section>
      )}
    </div>
  );
}

async function Browse() {
  const { categories, suppliers } = await getFacets();

  return (
    <>
      <section>
        <h2 className="mb-3 text-section font-semibold">קטגוריות</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={catalogHref({ category: c.slug })}
                className="flex h-full flex-col rounded-card bg-surface p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-caption text-muted">{c.count.toLocaleString("he-IL")} מוצרים</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-section font-semibold">ספקים</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {suppliers.map((s) => (
            <li key={s.code}>
              <Link
                href={catalogHref({ supplier: s.code })}
                className="flex h-full flex-col rounded-card bg-surface p-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift"
              >
                <Ltr className="font-medium">{s.name}</Ltr>
                <span className="text-caption text-muted">{s.count.toLocaleString("he-IL")} מוצרים</span>
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
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div className="flex flex-col gap-8">
        <Suspense>
          <TeamNotice />
        </Suspense>

        <section className="py-10 text-center sm:py-16">
          <h1 className="mb-4 text-hero-sm font-semibold sm:text-hero">
            ציוד <Ltr>FRC</Ltr> ו-<Ltr>FTC</Ltr> מכל הספקים, בהזמנה אחת
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-muted">
            מחפשים מוצרים, רואים מחיר בשקלים כולל מע״מ, ושולחים סל לספק הישראלי. הספק הישראלי מזמין מהספקים, מרכז ומוסר לקבוצה.
            ההרשמה נדרשת רק כשמזמינים.
          </p>
          <Form action="/catalog" className="mx-auto flex max-w-xl gap-2">
            <input
              type="search"
              name="q"
              placeholder="חיפוש לפי שם או מק״ט"
              aria-label="חיפוש"
              className="h-12 min-w-0 flex-1 rounded-full bg-surface px-5 shadow-lift"
            />
            <button className="h-12 rounded-full bg-brand px-6 text-white hover:bg-brand-strong">חיפוש</button>
          </Form>
        </section>

        <Suspense
          fallback={
            <Loading>
              <TileGridSkeleton />
            </Loading>
          }
        >
          <Browse />
        </Suspense>
      </div>
    </ViewTransition>
  );
}
