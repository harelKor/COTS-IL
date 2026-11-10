import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { Ltr } from "@/components/ltr";
import { formatDateTime } from "@/components/orders";
import { isFinished, ORDER_STEPS, STATUS_LABELS, type OrderStatusKey } from "@/domain/order-status";
import { formatIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { countByStatus, getOrderSummaries, type AdminOrderSummary } from "@/lib/admin-orders";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { OrderPanel } from "./order-panel";
import { STATUS_STYLE } from "./status-style";

export const metadata: Metadata = { title: "כל ההזמנות" };

type Params = { status?: string; q?: string; open?: string; finished?: string; edit?: string };

const OPEN_STATUSES = ORDER_STEPS.filter((s) => !isFinished(s));

const MAIN_ACTION: Record<OrderStatusKey, string> = {
  awaiting_quote: "אישור ושליחה לקבוצה",
  quote_sent: "קישורי אישור",
  to_order: "סימון כהוזמן מהספק",
  ordered: "רישום משלוח מהספק",
  to_warehouse: "קליטה במחסן",
  at_warehouse: "הפקת תעודת משלוח",
  to_team: "סימון כנמסר",
  delivered: "סיכום",
  rejected: "סיכום",
  cancelled: "סיכום",
};

/** Builds this page's URL with some parameters changed, so filters, search and the open card all survive. */
function href(params: Params, change: Partial<Params>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...change })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `/admin?${s}` : "/admin";
}

const relative = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
function age(date: Date, now: number) {
  const days = Math.floor((now - date.getTime()) / 86_400_000);
  if (days < 1) return "היום";
  return relative.format(-days, "day");
}

function matches(order: AdminOrderSummary, q: string) {
  const term = q.trim().replace(/^#/, "");
  if (!term) return true;
  return String(order.number) === term || order.teamLabel.includes(term) || order.teamLabel.split(" ")[1] === term || order.teamName.includes(term);
}

function Filters({ params, counts, total }: { params: Params; counts: Record<OrderStatusKey, number>; total: number }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-8">
        <li>
          <Link
            href={href(params, { status: undefined, open: undefined })}
            aria-current={!params.status ? "true" : undefined}
            className={`flex min-h-20 flex-col justify-between rounded-[18px] border-2 bg-surface p-3 ${
              !params.status ? "border-foreground" : "border-line"
            }`}
          >
            <span className="text-sm font-medium">הכל</span>
            <span className="text-2xl font-semibold tabular-nums">{total}</span>
          </Link>
        </li>
        {OPEN_STATUSES.map((s) => {
          const active = params.status === s;
          return (
            <li key={s}>
              <Link
                href={href(params, { status: active ? undefined : s, open: undefined })}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-20 flex-col justify-between rounded-[18px] border-2 p-3 ${STATUS_STYLE[s].box} ${
                  active ? STATUS_STYLE[s].edge : "border-transparent"
                }`}
              >
                <span className="text-sm font-medium">{STATUS_LABELS[s].admin}</span>
                <span className="text-2xl font-semibold tabular-nums">{counts[s]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <form action="/admin" className="flex gap-2" role="search">
        {params.status && <input type="hidden" name="status" value={params.status} />}
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4">
          <Search size={18} aria-hidden className="text-muted" />
          <input
            name="q"
            defaultValue={params.q}
            placeholder="מספר קבוצה או מספר הזמנה"
            aria-label="חיפוש לפי מספר קבוצה או מספר הזמנה"
            inputMode="search"
            className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
        <button className="min-h-11 rounded-full bg-subtle px-5 text-sm font-medium hover:bg-subtle-hover">חיפוש</button>
      </form>
    </div>
  );
}

function OrderCard({ order, params, now }: { order: AdminOrderSummary; params: Params; now: number }) {
  const open = params.open === order.id;
  const style = STATUS_STYLE[order.view.status];
  const label = STATUS_LABELS[order.view.status].admin;
  return (
    <li id={`o-${order.id}`} className={`card-surface scroll-mt-20 rounded-[18px] border-s-4 ${style.edge}`}>
      <Link
        href={href(params, { open: open ? undefined : order.id, edit: undefined })}
        scroll={false}
        aria-expanded={open}
        className="flex flex-col gap-2 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">
              <Ltr>{order.teamLabel}</Ltr> {order.teamName}
            </div>
            <div className="text-sm text-muted">
              הזמנה <Ltr>#{order.number}</Ltr>, <Ltr>{formatDateTime(order.submittedAt).slice(0, 10)}</Ltr>, {age(order.submittedAt, now)}
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style.chip}`}>{label}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            {order.itemCount} פריטים, {formatIls(order.totalIls)}
          </span>
          {!open && (
            <span className="flex min-h-11 items-center rounded-full bg-subtle px-4 text-sm font-medium text-brand-strong">
              {MAIN_ACTION[order.view.status]}
            </span>
          )}
        </div>
        {(order.view.progress || order.view.vendors) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {order.view.progress && <span className="rounded-full bg-subtle px-3 py-1">{order.view.progress}</span>}
            {order.view.vendors && <span className="rounded-full bg-subtle px-3 py-1">{order.view.vendors}</span>}
          </div>
        )}
      </Link>
      {open && (
        <div className="border-t border-line p-4">
          <Suspense fallback={<p className="text-sm text-muted">טוען…</p>}>
            <OrderPanel orderId={order.id} status={order.view.status} edit={params.edit === "1"} />
          </Suspense>
        </div>
      )}
    </li>
  );
}

async function AllOrders({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const now = new Date().getTime();
  const everything = await getOrderSummaries();
  const all = everything.filter((o) => !isFinished(o.view.status));
  const finished = everything.filter((o) => isFinished(o.view.status) && matches(o, params.q ?? "")).reverse();
  const counts = countByStatus(all);
  // The open card stays in the list after its action moves it out of the filter.
  const shown = all.filter(
    (o) => o.id === params.open || ((!params.status || o.view.status === params.status) && matches(o, params.q ?? "")),
  );
  const finishedOpen = params.finished === "1";

  return (
    <div className="flex flex-col gap-6">
      <Filters params={params} counts={counts} total={all.length} />

      {shown.length === 0 ? (
        <p className="text-muted">{params.status || params.q ? "אין הזמנות שמתאימות לסינון." : "אין הזמנות פתוחות."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((o) => (
            <OrderCard key={o.id} order={o} params={params} now={now} />
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3">
        <Link
          href={href(params, { finished: finishedOpen ? undefined : "1" })}
          scroll={false}
          aria-expanded={finishedOpen}
          className="flex min-h-11 items-center justify-between rounded-full bg-subtle px-4 font-semibold hover:bg-subtle-hover"
        >
          הזמנות שהסתיימו ({finished.length})
          <span aria-hidden>{finishedOpen ? "▴" : "▾"}</span>
        </Link>
        {finishedOpen && (
          <ul className="flex flex-col gap-3">
            {finished.map((o) => (
              <OrderCard key={o.id} order={o} params={params} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div>
      <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em]">כל ההזמנות</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <AllOrders searchParams={searchParams as Promise<Params>} />
      </Suspense>
    </div>
  );
}
