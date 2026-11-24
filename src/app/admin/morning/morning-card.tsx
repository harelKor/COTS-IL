import { desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Card, StatusTag } from "@/components/form";
import { db, schema } from "@/db";
import { MORNING_HOSTS } from "@/domain/morning";
import { morningCall, morningSetupNow, type MorningBusiness } from "@/lib/morning";
import { getSettings } from "@/lib/settings";
import { MorningStepsForm, TestMorningButton } from "./morning-forms";

const when = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <dt className="text-callout text-muted">{label}</dt>
      <dd className="text-callout">{children}</dd>
    </div>
  );
}

/**
 * P2: the "חשבונית ירוקה" card on /admin/settings/system: connected or not, test or live, the
 * business as Morning names it, the latest call, which steps run by themselves and "בדיקת חיבור".
 * Not shown at all while there are no Morning keys (production today: the owner's plan has no API).
 */
export async function MorningCard() {
  const setup = morningSetupNow();
  if (setup.state === "off") return null;
  if (setup.state === "invalid")
    return (
      <Card id="morning" className="flex scroll-mt-20 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section font-semibold">חשבונית ירוקה</h2>
          <StatusTag tone="danger">הגדרה חסרה</StatusTag>
        </div>
        <p className="text-callout">{setup.reason}. המשתנים MORNING_API_ID, MORNING_API_SECRET ו-MORNING_ENV מוגדרים ב-Vercel.</p>
      </Card>
    );

  const env = setup.config.env;
  const [settings, business, [last]] = await Promise.all([
    getSettings(),
    morningCall<MorningBusiness & { exemption?: boolean }>("GET", "/businesses/me")
      .then((b) => ({ ok: true as const, b }))
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "שגיאה" })),
    db.select().from(schema.jobRuns).where(eq(schema.jobRuns.job, "morning")).orderBy(desc(schema.jobRuns.at)).limit(1),
  ]);
  const lastError = last && !last.ok ? ((last.detail as { error?: string } | null)?.error ?? null) : null;

  return (
    <Card id="morning" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section font-semibold">חשבונית ירוקה</h2>
        {business.ok ? <StatusTag tone="success">מחוברת</StatusTag> : <StatusTag tone="danger">לא מחוברת</StatusTag>}
      </div>
      <dl className="divide-y divide-line">
        <Row label="חשבון">{env === "sandbox" ? <StatusTag tone="warning">בדיקה (sandbox)</StatusTag> : <StatusTag tone="brand">חי</StatusTag>}</Row>
        <Row label="העסק">{business.ok ? <bdi>{business.b.name}</bdi> : <span className="text-danger">{business.error}</span>}</Row>
        {last && (
          <Row label="הפעולה האחרונה">
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{when.format(last.at)}</span>
              {last.ok ? <StatusTag tone="success">הצליחה</StatusTag> : <StatusTag tone="danger">נכשלה</StatusTag>}
            </span>
          </Row>
        )}
      </dl>
      {lastError && <p className="text-caption text-danger">{lastError}</p>}
      {business.ok && business.b.exemption && (
        <p className="text-caption text-warning">העסק מוגדר בחשבונית ירוקה כעוסק פטור: אין בו חשבונית מס/קבלה וחשבונית זיכוי, ולכן הפקתן תיכשל.</p>
      )}
      <p className="text-caption text-muted">המסמכים נשלחים ללקוח במייל מחשבונית ירוקה. המחירים כוללים מע״מ, וחשבונית ירוקה מפרידה אותו בכל מסמך.</p>
      <MorningStepsForm steps={settings.morning} />
      <div className="flex flex-wrap items-center gap-3">
        <TestMorningButton />
        <a href={MORNING_HOSTS[env].app} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 text-callout text-brand hover:underline">
          <ExternalLink size={20} strokeWidth={1.75} aria-hidden />
          {env === "sandbox" ? "חשבונית ירוקה (בדיקה)" : "חשבונית ירוקה"}
        </a>
      </div>
    </Card>
  );
}
