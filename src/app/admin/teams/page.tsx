import { asc, desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { Ltr } from "@/components/ltr";
import { firstTeamUrl } from "@/domain/teams";
import { Button } from "@/components/form";
import { formatDateTime } from "@/components/orders";
import { isAvailabilityFresh } from "@/domain/reports";
import { requireAdmin } from "@/lib/auth";
import { getUsdIlsRate } from "@/lib/fx";
import { getSyncStatus } from "@/lib/reports";
import { reviewTeam } from "../actions";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { TeamName } from "@/components/team-name";

export const metadata: Metadata = { title: "קבוצות" };

const statusLabels = {
  pending: { text: "ממתינה", className: "bg-warning/10 text-warning" },
  active: { text: "פעילה", className: "bg-success/10 text-success" },
  rejected: { text: "נדחתה", className: "bg-danger/10 text-danger" },
  suspended: { text: "מושהית", className: "bg-subtle text-muted" },
} as const;

/** Flags a supplier whose last run failed, or that hasn't updated recently (AT-11). */
async function SyncStatus() {
  const [rows, usd] = await Promise.all([getSyncStatus(), getUsdIlsRate()]);
  const now = new Date();
  return (
    <section>
      <h2 className="mb-3 font-semibold">סנכרון קטלוג</h2>
      <p className="mb-3 text-sm text-muted">
        שער הדולר במחירים: <span className="ltr">{usd.rate}</span> (בנק ישראל, <span className="ltr">{usd.rateDate.split("-").reverse().join("/")}</span>)
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => {
          const stale = !row.lastSuccessAt || !isAvailabilityFresh(row.lastSuccessAt, now);
          const failed = row.status === "failed";
          return (
            <li
              key={row.supplierId}
              className={`rounded-lg border bg-surface p-3 text-sm ${stale || failed ? "border-warning" : "border-line"}`}
            >
              <div className="ltr font-medium">{row.supplierName}</div>
              <div className="text-caption text-muted">
                {row.lastSuccessAt ? (
                  <>
                    עודכן: <span className="ltr">{formatDateTime(row.lastSuccessAt)}</span>
                  </>
                ) : (
                  "עדיין לא עודכן"
                )}
              </div>
              {failed && <div className="text-caption text-warning">הריצה האחרונה נכשלה</div>}
              {stale && <div className="text-caption text-warning">הזמינות מוצגת כלא מאומתת</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function TeamsTable() {
  await requireAdmin();

  const [teams, members] = await Promise.all([
    db.select().from(schema.teams).orderBy(desc(schema.teams.createdAt)),
    db
      .select({ teamId: schema.memberships.teamId, email: schema.profiles.email })
      .from(schema.memberships)
      .innerJoin(schema.profiles, eq(schema.profiles.id, schema.memberships.userId))
      .orderBy(asc(schema.memberships.createdAt)),
  ]);
  // Every sign-in email on a team is equal (D11), so the team shows all of them.
  const rows = teams.map((team) => ({
    team,
    emails: members.filter((m) => m.teamId === team.id).map((m) => m.email),
  }));

  const pending = rows.filter((r) => r.team.status === "pending");

  return (
    <div className="flex flex-col gap-8">
      <SyncStatus />

      <section>
        <h2 className="mb-3 font-semibold">בקשות הרשמה ממתינות ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-muted">אין בקשות ממתינות.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map(({ team, emails }) => (
              <li key={team.id} className="card-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      <TeamName team={team} />
                      <a
                        href={firstTeamUrl(team.program, team.number)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ms-2 inline-flex min-h-11 items-center gap-1 text-callout font-normal text-brand hover:underline"
                      >
                        <span>
                          דף הקבוצה ב-FIRST <Ltr>{`${team.program} ${team.number}`}</Ltr>
                        </span>
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </div>
                    <div className="text-sm text-muted">
                      {team.contactName}, <span className="ltr">{team.contactPhone}</span>
                      {emails.map((email) => (
                        <span key={email}>
                          , <span className="ltr">{email}</span>
                        </span>
                      ))}
                    </div>
                    {team.address && <div className="text-sm text-muted">{team.address}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={reviewTeam}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="decision" value="active" />
                      <Button variant="secondary">אישור</Button>
                    </form>
                    <form action={reviewTeam} className="flex items-center gap-2">
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input
                        name="reason"
                        placeholder="סיבת דחייה (לא חובה)"
                        className="h-11 w-44 rounded-xl border border-line bg-surface px-3 text-sm"
                      />
                      <Button variant="ghost" className="text-danger!">
                        דחייה
                      </Button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">כל הקבוצות</h2>
        <div className="overflow-x-auto card-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-start text-muted">
              <tr>
                <th className="px-4 py-2 text-start font-medium">קבוצה</th>
                <th className="px-4 py-2 text-start font-medium">מספר</th>
                <th className="px-4 py-2 text-start font-medium">כתובות כניסה</th>
                <th className="px-4 py-2 text-start font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ team, emails }) => (
                <tr key={team.id} className="border-t border-line">
                  <td className="px-4 py-2">{team.name}</td>
                  <td className="px-4 py-2">
                    <span className="ltr">{`${team.program} ${team.number}`}</span>
                  </td>
                  <td className="px-4 py-2">
                    {emails.map((email) => (
                      <div key={email} className="ltr">
                        {email}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-caption ${statusLabels[team.status].className}`}>
                      {statusLabels[team.status].text}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function TeamsPage() {
  return (
    <div>
      <h1 className="mb-6 text-title font-semibold">קבוצות</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <TeamsTable />
      </Suspense>
    </div>
  );
}
