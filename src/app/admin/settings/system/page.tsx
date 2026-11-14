import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { Card, StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db, schema } from "@/db";
import { emailConfig } from "@/domain/notifications";
import { needsAttention, type PageRunStats } from "@/domain/sync-health";
import { STALE_PRICE_DAYS, worstLevel } from "@/domain/health";
import { requireAdmin } from "@/lib/auth";
import { getHealth } from "@/lib/health";
import { priceContext } from "@/lib/settings";
import { syncUnavailableReason } from "@/lib/supplier-admin";
import { HealthList } from "../../health-list";
import { TestEmailButton } from "./test-email";

export const metadata: Metadata = { title: "הגדרות: מערכת" };

const when = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric" });

const LINKS = [
  { label: "Vercel: הפרויקט", href: "https://vercel.com/cots-il/cotsil" },
  { label: "Vercel: פריסות", href: "https://vercel.com/cots-il/cotsil/deployments" },
  { label: "Vercel: שימוש וחיוב", href: "https://vercel.com/cots-il/~/usage" },
  { label: "Supabase: מסד הנתונים", href: "https://supabase.com/dashboard/project/lzpxrlvtcxyoiuwkoaha" },
  { label: "Supabase: משתמשים ומיילים", href: "https://supabase.com/dashboard/project/lzpxrlvtcxyoiuwkoaha/auth/users" },
  { label: "GitHub: סנכרון וגיבוי", href: "https://github.com/harelKor/COTS-IL/actions" },
];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <dt className="text-callout text-muted">{label}</dt>
      <dd className="text-callout">{children}</dd>
    </div>
  );
}

type Job = {
  code: string;
  name: string;
  platform: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
  products: number | null;
  counts: (Partial<PageRunStats> & { warnings?: string[] }) | null;
};

async function System() {
  await requireAdmin();
  const [ctx, health, jobs] = await Promise.all([
    priceContext(),
    getHealth(),
    db.execute<Job>(sql`
      SELECT s.code, s.name, s.platform, j.status, j.started_at, j.finished_at, j.error, (j.counts->>'products')::int AS products, j.counts
      FROM ${schema.suppliers} s
      LEFT JOIN LATERAL (
        SELECT * FROM ${schema.syncJobs} j WHERE j.supplier_id = s.id ORDER BY j.started_at DESC LIMIT 6
      ) j ON true
      WHERE s.platform <> 'manual'
      ORDER BY s.name, j.started_at DESC`),
  ]);
  const bySupplier = new Map<string, { name: string; jobs: Job[] }>();
  for (const j of jobs.rows) {
    const entry = bySupplier.get(j.code) ?? { name: j.name, jobs: [] };
    if (j.started_at) entry.jobs.push(j);
    bySupplier.set(j.code, entry);
  }

  const email = emailConfig(process.env);
  const emailReason = email ? null : "חסרים RESEND_API_KEY ו-EMAIL_FROM בהגדרות Vercel (המדריך למנהל, ״מה עוד צריך להגדיר״). עד אז לא יוצאים מיילים.";
  const github = syncUnavailableReason();
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const built = process.env.BUILD_TIME;

  const worst = worstLevel(health.checks);

  return (
    <div className="flex flex-col gap-6">
      <Card id="health" className="flex scroll-mt-20 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section font-semibold">בריאות האתר</h2>
          {worst === "red" ? <StatusTag tone="danger">יש תקלה</StatusTag> : worst === "yellow" ? <StatusTag tone="warning">יש מה לבדוק</StatusTag> : <StatusTag tone="success">הכול תקין</StatusTag>}
        </div>
        <p className="text-caption text-muted">
          הסנכרון, הגיבוי, השער, המיילים ומפתח GitHub. בדיקה יומית ב-08:00 בערך שולחת מייל למנהלים כשמשהו אדום (כשהמייל מוגדר), ו-<Ltr>/api/health</Ltr> מחזיר את המצב לשירות ניטור חיצוני. כל שורה מובילה למקום שבו מתקנים.
          {health.staleSuppliers.length > 0 && ` אצל ספק שלא סונכרן ${STALE_PRICE_DAYS} ימים המחירים מוצגים ״ייבדק בהצעה״.`}
        </p>
        <HealthList checks={health.checks} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="email" className="flex scroll-mt-20 flex-col gap-2">
          <h2 className="text-section font-semibold">חיבורים</h2>
          <dl className="divide-y divide-line">
            <Row label="שער הדולר">
              <span className="tabular-nums">
                <Ltr>{ctx.rate.toFixed(4)}</Ltr> {ctx.manualRate ? "(ידני)" : `(בנק ישראל, ${day.format(new Date(ctx.rateDate))})`}
              </span>
            </Row>
            {ctx.manualRate && (
              <Row label="שער בנק ישראל">
                <span className="tabular-nums">
                  <Ltr>{ctx.boiRate.toFixed(4)}</Ltr>, {day.format(new Date(ctx.rateDate))}
                </span>
              </Row>
            )}
            <Row label="מייל (Resend)">{email ? <StatusTag tone="success">מוגדר</StatusTag> : <StatusTag tone="warning">לא מוגדר</StatusTag>}</Row>
            <Row label="״סנכרון עכשיו״ (GITHUB_TOKEN)">{github ? <StatusTag tone="warning">לא מוגדר</StatusTag> : <StatusTag tone="success">מוגדר</StatusTag>}</Row>
          </dl>
          {github && <p className="text-caption text-muted">{github}</p>}
          <TestEmailButton unavailable={emailReason} />
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="text-section font-semibold">הפריסה האחרונה</h2>
          <dl className="divide-y divide-line">
            <Row label="נבנתה">{built ? when.format(new Date(built)) : "לא ידוע"}</Row>
            <Row label="סביבה">
              <Ltr>{process.env.VERCEL_ENV ?? "local"}</Ltr>
            </Row>
            {sha && (
              <Row label="גרסה">
                <a href={`https://github.com/harelKor/COTS-IL/commit/${sha}`} target="_blank" rel="noopener noreferrer" className="font-mono text-brand hover:underline">
                  <Ltr>{sha.slice(0, 7)}</Ltr>
                </a>
              </Row>
            )}
          </dl>
          {process.env.VERCEL_GIT_COMMIT_MESSAGE && (
            <p className="text-caption text-muted">
              <Ltr>{process.env.VERCEL_GIT_COMMIT_MESSAGE.split("\n")[0].slice(0, 120)}</Ltr>
            </p>
          )}
          <h3 className="mt-2 text-callout font-semibold">לוחות בקרה</h3>
          <ul className="flex flex-col">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 text-callout text-brand hover:underline">
                  <ExternalLink size={20} strokeWidth={1.75} aria-hidden />
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">סנכרון לפי ספק</h2>
          <p className="text-caption text-muted">
            הסנכרון רץ כל לילה ב-04:00 בערך. חנויות BigCommerce (goBILDA, REV) נקראות במלואן בלילה שבין שישי לשבת, ובשאר הלילות רק החלקים שבעגלות, בהזמנות ובמומלצים. שש הריצות האחרונות של כל ספק. איך המוצרים קובצו למשפחות ומה ממתין לבדיקה:{" "}
            <Link href="/admin/settings/system/grouping" className="text-brand hover:underline">
              דוח קיבוץ
            </Link>
            .
          </p>
        </div>
        <ul className="grid gap-4 lg:grid-cols-2">
          {[...bySupplier].map(([code, s]) => (
            <li key={code} className="card-surface flex flex-col gap-2 p-4 sm:p-5">
              <h3 className="text-body font-semibold">
                <Ltr>{s.name}</Ltr>
              </h3>
              {s.jobs.length === 0 ? (
                <p className="text-callout text-muted">עוד לא סונכרן.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {s.jobs.map((j) => (
                    <li key={String(j.started_at)} className="flex flex-col gap-1 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-callout tabular-nums">{when.format(new Date(j.started_at))}</span>
                        <span className="flex flex-wrap items-center gap-2">
                          {j.counts?.mode && <span className="text-caption text-muted">{j.counts.mode === "refresh" ? "רענון" : "קריאה מלאה"}</span>}
                          {j.counts?.pages ? (
                            <span className="text-caption text-muted tabular-nums">
                              {(j.counts.parsed ?? 0).toLocaleString("he-IL")} מתוך {(j.counts.pages - (j.counts.stubs ?? 0) - (j.counts.landing ?? 0)).toLocaleString("he-IL")} דפים
                            </span>
                          ) : null}
                          {j.products !== null && <span className="text-caption text-muted tabular-nums">{j.products.toLocaleString("he-IL")} חלקים</span>}
                          {j.status === "succeeded" && needsAttention(j.counts) && <StatusTag tone="warning">בדיקה: חלק מהדפים בלי מחיר או מלאי</StatusTag>}
                          {j.status === "succeeded" ? (
                            <StatusTag tone="success">הצליח</StatusTag>
                          ) : j.status === "failed" ? (
                            <StatusTag tone="danger">נכשל</StatusTag>
                          ) : (
                            <StatusTag tone="brand">רץ</StatusTag>
                          )}
                        </span>
                      </div>
                      {j.error && (
                        <p className="text-caption break-words text-danger">
                          <Ltr>{j.error.slice(0, 300)}</Ltr>
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function SystemSettingsPage() {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <System />
    </Suspense>
  );
}
