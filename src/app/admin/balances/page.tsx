import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { TeamName } from "@/components/team-name";
import { AGEING_BUCKETS, AGEING_LABEL, owingFirst } from "@/domain/payments";
import { formatIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { getBalances } from "@/lib/payments";

export const metadata: Metadata = { title: "יתרות" };

const money = (n: number) => formatIls(n, { agorot: true });

/** P1 "יתרות": every team that owes, the oldest debt first, with its ageing, and the bookkeeper's export. */
async function Balances() {
  await requireAdmin();
  const all = await getBalances();
  const owing = owingFirst(all);
  const credit = all.filter((t) => t.balance.balance < 0);
  const totals = Object.fromEntries(AGEING_BUCKETS.map((b) => [b, owing.reduce((n, t) => n + t.balance.ageing[b], 0)])) as Record<(typeof AGEING_BUCKETS)[number], number>;
  const total = owing.reduce((n, t) => n + t.balance.balance, 0);

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card-surface flex flex-col p-4">
          <dt className="text-caption text-muted">סה״כ לגבייה</dt>
          <dd className="text-title font-semibold tabular-nums">{money(total)}</dd>
        </div>
        {AGEING_BUCKETS.map((b) => (
          <div key={b} className="card-surface flex flex-col p-4">
            <dt className="text-caption text-muted">{AGEING_LABEL[b]} מהאישור</dt>
            <dd className={`text-section font-semibold tabular-nums ${b === "60+" && totals[b] > 0 ? "text-danger" : ""}`}>{money(totals[b])}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="owing" className="flex flex-col gap-3">
        <h2 id="owing" className="text-section font-semibold">
          קבוצות שחייבות <span className="text-base font-normal text-muted tabular-nums">({owing.length})</span>
        </h2>
        {owing.length === 0 ? (
          <p className="text-muted">אף קבוצה לא חייבת כרגע.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {owing.map((t) => (
              <li key={t.teamId} className="card-surface flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`/admin/teams/${t.teamId}`} className="flex min-h-11 items-center font-semibold hover:text-brand">
                    <TeamName team={t} />
                  </Link>
                  <span className="flex items-center gap-2">
                    {(t.balance.oldestDays ?? 0) > 60 && <StatusTag tone="danger">מעל 60 יום</StatusTag>}
                    <span className="text-section font-semibold tabular-nums">{money(t.balance.balance)}</span>
                  </span>
                </div>
                <dl className="grid grid-cols-3 gap-x-4 text-sm">
                  {AGEING_BUCKETS.map((b) => (
                    <div key={b} className="flex flex-col">
                      <dt className="text-caption text-muted">{AGEING_LABEL[b]}</dt>
                      <dd className="tabular-nums">{money(t.balance.ageing[b])}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="flex flex-wrap gap-2 text-caption">
                  {t.balance.open.map((o) => (
                    <li key={o.orderId}>
                      <Link href={`/admin?open=${o.orderId}`} className="inline-flex min-h-11 items-center rounded-full bg-subtle px-3 hover:bg-subtle-hover">
                        הזמנה&nbsp;<Ltr>{o.number}</Ltr>, {money(o.left)}, לפני {o.days} ימים
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {credit.length > 0 && (
        <section aria-labelledby="credit" className="flex flex-col gap-2">
          <h2 id="credit" className="text-section font-semibold">
            קבוצות עם זכות
          </h2>
          <ul className="card-surface flex flex-col divide-y divide-line">
            {credit.map((t) => (
              <li key={t.teamId}>
                <Link href={`/admin/teams/${t.teamId}`} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 hover:text-brand">
                  <TeamName team={t} />
                  <span className="tabular-nums">{money(-t.balance.balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">ייצוא תשלומים לרואה החשבון</h2>
        <p className="text-caption text-muted">קובץ CSV: תאריך, קבוצה, הזמנה, סכום, אמצעי תשלום, אסמכתא ומספר מסמך. תשלומים שבוטלו נשארים בקובץ, מסומנים.</p>
        <form action="/admin/balances/export" method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-callout">
            מתאריך
            <input type="date" name="from" lang="he-IL" className="h-11 rounded-xl bg-subtle px-3 text-base" />
          </label>
          <label className="flex flex-col gap-1 text-callout">
            עד תאריך
            <input type="date" name="to" lang="he-IL" className="h-11 rounded-xl bg-subtle px-3 text-base" />
          </label>
          <button className="btn-soft inline-flex min-h-11 items-center rounded-full px-5 text-callout font-medium">הורדת CSV</button>
        </form>
      </Card>
    </div>
  );
}

export default function BalancesPage() {
  return (
    <div>
      <h1 className="mb-6 text-title font-semibold tracking-[-0.02em]">יתרות</h1>
      <Suspense
        fallback={
          <Loading>
            <PageSkeleton />
          </Loading>
        }
      >
        <Balances />
      </Suspense>
    </div>
  );
}
