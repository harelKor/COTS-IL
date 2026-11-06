import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { Button } from "@/components/form";
import { formatDateTime } from "@/components/orders";
import { isAvailabilityFresh } from "@/domain/reports";
import { requireAdmin } from "@/lib/auth";
import { countOrdersAwaitingMentor } from "@/lib/orders";
import { getSyncStatus } from "@/lib/reports";
import { reviewTeam } from "./actions";
import { Loading, PageSkeleton } from "@/components/skeleton";

const statusLabels = {
  pending: { text: "ממתינה", className: "bg-warning/10 text-warning" },
  active: { text: "פעילה", className: "bg-success/10 text-success" },
  rejected: { text: "נדחתה", className: "bg-danger/10 text-danger" },
  suspended: { text: "מושהית", className: "bg-subtle text-muted" },
} as const;

/** Flags a supplier whose last run failed, or that hasn't updated recently (AT-11). */
async function SyncStatus() {
  const rows = await getSyncStatus();
  const now = new Date();
  return (
    <section>
      <h2 className="mb-3 font-semibold">סנכרון קטלוג</h2>
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
              <div className="text-xs text-muted">
                {row.lastSuccessAt ? (
                  <>
                    עודכן: <span className="ltr">{formatDateTime(row.lastSuccessAt)}</span>
                  </>
                ) : (
                  "עדיין לא עודכן"
                )}
              </div>
              {failed && <div className="text-xs text-warning">הריצה האחרונה נכשלה</div>}
              {stale && <div className="text-xs text-warning">הזמינות מוצגת כלא מאומתת</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function TeamsTable() {
  await requireAdmin();

  const rows = await db
    .select({ team: schema.teams, email: schema.profiles.email })
    .from(schema.teams)
    .innerJoin(
      schema.memberships,
      and(eq(schema.memberships.teamId, schema.teams.id), eq(schema.memberships.role, "team_admin")),
    )
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.memberships.userId))
    .orderBy(desc(schema.teams.createdAt));

  const pending = rows.filter((r) => r.team.status === "pending");
  const awaitingOrders = await countOrdersAwaitingMentor();

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/admin/orders"
        className="flex items-center justify-between rounded-lg border border-line bg-surface p-4 hover:border-brand"
      >
        <span className="font-semibold">הזמנות קבוצות</span>
        <span className="text-sm text-muted">{awaitingOrders} ממתינות לבדיקה</span>
      </Link>
      <Link
        href="/admin/purchasing"
        className="flex items-center justify-between rounded-lg border border-line bg-surface p-4 hover:border-brand"
      >
        <span className="font-semibold">רכש והזמנות ספק</span>
      </Link>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { href: "/admin/logistics", label: "משלוחים וקליטה" },
          { href: "/admin/deliveries", label: "מסירות" },
          { href: "/admin/shortages", label: "דוח חוסרים" },
          { href: "/admin/reports", label: "דוחות" },
          { href: "/admin/catalog/grouping", label: "קיבוץ מוצרים למשפחות" },
        ].map((link) => (
          <Link key={link.href} href={link.href} className="rounded-lg border border-line bg-surface p-4 font-semibold hover:border-brand">
            {link.label}
          </Link>
        ))}
      </div>

      <SyncStatus />

      <section>
        <h2 className="mb-3 font-semibold">בקשות הרשמה ממתינות ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-muted">אין בקשות ממתינות.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map(({ team, email }) => (
              <li key={team.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">
                      {team.name}, <span className="ltr">{`${team.program} ${team.number}`}</span>
                    </div>
                    <div className="text-sm text-muted">
                      {team.contactName}, <span className="ltr">{team.contactPhone}</span>,{" "}
                      <span className="ltr">{email}</span>
                    </div>
                    {team.address && <div className="text-sm text-muted">{team.address}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={reviewTeam}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="decision" value="active" />
                      <Button>אישור</Button>
                    </form>
                    <form action={reviewTeam} className="flex items-center gap-2">
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input
                        name="reason"
                        placeholder="סיבת דחייה (לא חובה)"
                        className="h-10 w-44 rounded-md border border-line bg-surface px-3 text-sm"
                      />
                      <Button variant="ghost">דחייה</Button>
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
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-start text-muted">
              <tr>
                <th className="px-4 py-2 text-start font-medium">קבוצה</th>
                <th className="px-4 py-2 text-start font-medium">מספר</th>
                <th className="px-4 py-2 text-start font-medium">איש קשר</th>
                <th className="px-4 py-2 text-start font-medium">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ team, email }) => (
                <tr key={team.id} className="border-t border-line">
                  <td className="px-4 py-2">{team.name}</td>
                  <td className="px-4 py-2">
                    <span className="ltr">{`${team.program} ${team.number}`}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="ltr">{email}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusLabels[team.status].className}`}>
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

export default function AdminPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">ניהול</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <TeamsTable />
      </Suspense>
    </div>
  );
}
