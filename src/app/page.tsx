import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import { sized } from "@/components/catalog";
import { CategoryIcon } from "@/components/category-icon";
import { HomeCommandBar } from "@/components/home-command-bar";
import { InstallAppButton } from "@/components/install-app";
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

/** Short monograms for the supplier badges; a new supplier gets its name's initials. */
const MONOGRAMS: Record<string, string> = { wcp: "WCP", andymark: "AM", ctre: "CTRE", ttb: "TTB", rev: "REV", gobilda: "GB" };

function monogram(code: string, name: string) {
  return (
    MONOGRAMS[code] ??
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 4)
      .toUpperCase()
  );
}

/** Where each of up to three photos sits in the fan: the first in front, the others tilted behind it. */
const FAN = [
  "z-20 size-[72px] sm:size-[84px]",
  "z-10 size-14 -translate-x-[34px] translate-y-2 -rotate-[8deg] sm:size-[68px] sm:-translate-x-[54px]",
  "z-10 size-14 translate-x-[34px] translate-y-2 rotate-[8deg] sm:size-[68px] sm:translate-x-[54px]",
];

/** Up to three real product photos fanned out on studio tiles; the category's icon only when it has none. */
function CategoryShowcase({ slug, name, images }: { slug: string; name: string; images: string[] }) {
  if (images.length === 0) {
    return (
      <span className="tile-fade flex size-[84px] items-center justify-center rounded-2xl">
        <CategoryIcon slug={slug} />
      </span>
    );
  }
  return (
    <>
      {images.map((src, i) => (
        <span
          key={src}
          className={`tile-fade absolute flex items-center justify-center overflow-hidden rounded-2xl p-2 shadow-card transition duration-300 ease-out ${FAN[i]} ${
            i === 0 ? "group-hover:-translate-y-1 group-hover:scale-[1.04]" : ""
          }`}
        >
          {/* Hot-linked from the supplier's CDN, like every catalog photo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sized(src, 200)}
            alt={i === 0 ? name : ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full object-contain mix-blend-multiply"
          />
        </span>
      ))}
    </>
  );
}

async function Browse() {
  const { categories, suppliers } = await getFacets();

  return (
    <>
      <section>
        <h2 className="mb-4 text-section font-semibold">קטגוריות</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={catalogHref({ category: c.slug })}
                className="group flex h-full flex-col gap-4 rounded-[22px] border border-line bg-gradient-to-b from-[#E8F1FF] via-[#F5F9FF] to-white p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-1 hover:border-brand/50 hover:shadow-lift sm:p-5"
              >
                <span className="relative flex h-24 items-center justify-center">
                  <CategoryShowcase slug={c.slug} name={c.name} images={c.images} />
                </span>
                <span className="flex flex-col items-start gap-1.5">
                  <span className="text-[17px] leading-snug font-bold text-foreground transition-colors group-hover:text-brand">
                    {c.name}
                  </span>
                  <span className="rounded-full bg-brand-soft/70 px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
                    {c.count.toLocaleString("he-IL")} מוצרים
                  </span>
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
                className="group flex h-full min-h-16 items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="btn-brand flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl px-1.5 font-mono text-[12px] font-bold tracking-tight"
                  >
                    {monogram(s.code, s.name)}
                  </span>
                  <Ltr className="truncate text-[16px] font-semibold tracking-tight transition-colors group-hover:text-brand">
                    {s.name}
                  </Ltr>
                </span>
                <span className="shrink-0 rounded-full bg-brand-soft/70 px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
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

/** One-tap examples for a first visit, each a real search that finds parts. */
const EXAMPLES = ["Kraken X60", "SDS MK4i", "REV Spark MAX", '1/2" Hex Bearing'];

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
            ציוד <Ltr>FRC</Ltr> ו-<Ltr>FTC</Ltr> מכל הספקים,{" "}
            <span className="bg-gradient-to-l from-[#1E3A8A] via-[#2563EB] to-[#3B82F6] bg-clip-text text-transparent">
              בהזמנה אחת
            </span>
          </h1>
          <p className="max-w-xl text-muted">
            בונים סל מ-<Ltr>AndyMark</Ltr>, <Ltr>WCP</Ltr>, <Ltr>CTRE</Ltr> ו-<Ltr>The Thrifty Bot</Ltr>, והספק הישראלי מזמין, מרכז
            ומוסר לקבוצה. הרשמה רק כשמזמינים.
          </p>
          <div className="flex w-full flex-col items-center gap-4 pt-2">
            <HomeCommandBar />
            <ul aria-label="דוגמאות לחיפוש" className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((q) => (
                <li key={q}>
                  <Link
                    href={catalogHref({ q })}
                    className="flex h-11 items-center rounded-full border border-line bg-white/90 px-4 text-[14px] font-medium text-muted shadow-2xs transition-colors hover:border-brand/40 hover:bg-subtle hover:text-brand"
                  >
                    <Ltr>{q}</Ltr>
                  </Link>
                </li>
              ))}
            </ul>
            <InstallAppButton />
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
