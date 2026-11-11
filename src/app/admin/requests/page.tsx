import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { Ltr } from "@/components/ltr";
import { formatDateTime } from "@/components/orders";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { TeamName } from "@/components/team-name";
import { requireAdmin } from "@/lib/auth";
import { setPartRequestHandled } from "./actions";

const { partRequests, teams, profiles } = schema;

async function requestsWhere(handled: boolean, limit: number) {
  return db
    .select({
      id: partRequests.id,
      url: partRequests.url,
      note: partRequests.note,
      query: partRequests.query,
      createdAt: partRequests.createdAt,
      handledAt: partRequests.handledAt,
      team: { name: teams.name, program: teams.program, number: teams.number },
      email: profiles.email,
    })
    .from(partRequests)
    .leftJoin(teams, eq(teams.id, partRequests.teamId))
    .leftJoin(profiles, eq(profiles.id, partRequests.userId))
    .where(
      handled
        ? isNotNull(partRequests.handledAt)
        : isNull(partRequests.handledAt),
    )
    .orderBy(desc(handled ? partRequests.handledAt : partRequests.createdAt))
    .limit(limit);
}

type Row = Awaited<ReturnType<typeof requestsWhere>>[number];

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function RequestRow({ r }: { r: Row }) {
  const handled = r.handledAt !== null;
  return (
    <li className="card-surface flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer noopener"
          className="truncate font-medium text-brand hover:underline"
        >
          <Ltr>{host(r.url)}</Ltr>
        </a>
        <Ltr className="truncate text-caption text-muted">{r.url}</Ltr>
        {r.note && <p className="whitespace-pre-wrap text-sm">{r.note}</p>}
        <p className="text-caption text-muted">
          {r.team?.name ? (
            <TeamName team={r.team} />
          ) : (
            <Ltr>{r.email ?? "ללא קבוצה"}</Ltr>
          )}
          {", "}
          {formatDateTime(r.createdAt)}
          {r.query && (
            <>
              {", חיפשו: "}
              <Ltr>{r.query}</Ltr>
            </>
          )}
        </p>
      </div>
      <form action={setPartRequestHandled} className="shrink-0">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="handled" value={handled ? "0" : "1"} />
        <button
          className={`min-h-11 rounded-full px-5 text-sm font-medium ${handled ? "border border-line bg-surface hover:bg-subtle" : "btn-brand"}`}
        >
          {handled ? "החזרה לפתוחות" : "טופל"}
        </button>
      </form>
    </li>
  );
}

async function Requests() {
  await requireAdmin();
  const [open, handled] = await Promise.all([
    requestsWhere(false, 200),
    requestsWhere(true, 20),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 font-semibold">פתוחות ({open.length})</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted">
            אין בקשות פתוחות. קבוצה שלא מוצאת חלק בחיפוש יכולה לשלוח כאן קישור.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((r) => (
              <RequestRow key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>
      {handled.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-muted">טופלו לאחרונה</h2>
          <ul className="flex flex-col gap-3 opacity-80">
            {handled.map((r) => (
              <RequestRow key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Links teams sent for parts the catalog doesn't have (S5 task 8). */
export default function PartRequestsPage() {
  return (
    <div>
      <h1 className="mb-6 text-title font-semibold">בקשות חלקים</h1>
      <Suspense
        fallback={
          <Loading>
            <PageSkeleton />
          </Loading>
        }
      >
        <Requests />
      </Suspense>
    </div>
  );
}
