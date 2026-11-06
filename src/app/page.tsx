import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { HomeCommandBar } from "@/components/home-command-bar";
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
              {last.lineCount} שורות, {formatIls(last.quoteTotal ?? last.requestTotal)}
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
        <h2 className="mb-4 text-section font-semibold">קטגוריות</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={catalogHref({ category: c.slug })}
                className="group card-surface flex h-full flex-col gap-4 p-5 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="flex items-start justify-between gap-2">
                  <CategoryIcon slug={c.slug} />
                  <ChevronLeft
                    size={20}
                    strokeWidth={1.75}
                    aria-hidden
                    className="text-muted transition duration-200 ease-out group-hover:-translate-x-1 group-hover:text-brand"
                  />
                </span>
                <span className="flex flex-col">
                  <span className="text-[17px] leading-snug font-semibold">{c.name}</span>
                  <span className="text-caption text-muted">{c.count.toLocaleString("he-IL")} מוצרים</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-section font-semibold">ספקים</h2>
        <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
          {suppliers.map((s) => (
            <li key={s.code}>
              <Link
                href={catalogHref({ supplier: s.code })}
                className="card-surface flex h-full min-h-16 items-center justify-between gap-3 px-5 py-4 transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift"
              >
                <Ltr className="truncate text-[16px] font-semibold tracking-tight">{s.name}</Ltr>
                <span className="shrink-0 rounded-full bg-subtle px-2.5 py-1 text-caption text-muted tabular-nums">
                  {s.count.toLocaleString("he-IL")} מוצרים
                </span>
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

        <section className="flex flex-col items-center gap-6 py-10 text-center sm:py-16">
          <p className="card-surface rounded-full px-4 py-1.5 text-caption text-muted">
            פורטל הרכש המרכזי לקבוצות <Ltr>FIRST</Ltr> בישראל, מחירים בש״ח כולל מע״מ
          </p>
          <h1 className="max-w-3xl text-hero-sm font-semibold sm:text-hero">
            ציוד <Ltr>FRC</Ltr> ו-<Ltr>FTC</Ltr> מכל הספקים, בהזמנה אחת
          </h1>
          <p className="max-w-xl text-muted">
            בונים סל מ-<Ltr>AndyMark</Ltr>, <Ltr>WCP</Ltr>, <Ltr>CTRE</Ltr> ו-<Ltr>The Thrifty Bot</Ltr>, והספק הישראלי מזמין, מרכז
            ומוסר לקבוצה. הרשמה רק כשמזמינים.
          </p>
          <div className="w-full pt-2">
            <HomeCommandBar />
          </div>
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
