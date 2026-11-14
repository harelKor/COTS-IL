import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ltr } from "@/components/ltr";
import { TeamName } from "@/components/team-name";
import { groupInbox, INBOX_SORTS, NEEDS_ADMIN, parseInboxSort } from "@/domain/admin-orders";
import { formatDay } from "@/domain/display";
import { OrderStatusTag, TONE_BOX } from "@/components/order-status-tag";
import { isFinished, ORDER_STEPS, statusLabel, type OrderStatusKey } from "@/domain/order-status";
import { countOf, ITEM, units } from "@/domain/plural";
import { formatIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { countByStatus, getOrderSummaries, type AdminOrderSummary } from "@/lib/admin-orders";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { GoLiveBanner } from "./go-live-banner";
import { OrderPanel } from "./order-panel";
import { OrderCardShell } from "./order-card-shell";
import { STATUS_STYLE } from "./status-style";
import { BULK_FORM, BulkOrdered, InboxSearch } from "./inbox-controls";

export const metadata: Metadata = { title: "כל ההזמנות" };

type Params = { status?: string; q?: string; open?: string; edit?: string; sort?: string };

const OPEN_STATUSES = ORDER_STEPS.filter((s) => !isFinished(s));

/** The two tabs for orders that are over (A-05). "בוטלו" holds rejected orders too: both stopped. */
const DONE_TABS = [
  { key: "delivered", label: "נמסרו", statuses: ["delivered"], empty: "אין הזמנות שנמסרו." },
  { key: "cancelled", label: "בוטלו", statuses: ["cancelled", "rejected"], empty: "אין הזמנות שבוטלו או נדחו." },
] as const satisfies { key: OrderStatusKey; label: string; statuses: OrderStatusKey[]; empty: string }[];

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

const clean = (params: Params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>;

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
  return String(order.number) === term || String(order.teamNumber).startsWith(term) || order.teamDisplay.toLowerCase().includes(term.toLowerCase());
}

function Filters({ params, counts, total }: { params: Params; counts: Record<OrderStatusKey, number>; total: number }) {
  const box = (active: boolean, style: { box: string; edge: string }) =>
    `flex min-h-20 flex-col justify-between rounded-[18px] border-2 p-3 ${style.box} ${active ? style.edge : "border-transparent"}`;
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <li>
          <Link
            href={href(params, { status: undefined, open: undefined })}
            aria-current={!params.status ? "true" : undefined}
            className={`flex min-h-20 flex-col justify-between rounded-[18px] border-2 bg-surface p-3 ${
              !params.status ? "border-foreground" : "border-line"
            }`}
          >
            <span className="text-sm font-medium">פתוחות</span>
            <span className="text-title font-semibold tabular-nums">{total}</span>
          </Link>
        </li>
        {OPEN_STATUSES.map((s) => {
          const active = params.status === s;
          return (
            <li key={s}>
              <Link
                href={href(params, { status: active ? undefined : s, open: undefined })}
                aria-current={active ? "true" : undefined}
                className={box(active, STATUS_STYLE[s])}
              >
                <span className="text-sm font-medium">{statusLabel(s, "admin")}</span>
                <span className="text-title font-semibold tabular-nums">{counts[s]}</span>
              </Link>
            </li>
          );
        })}
        {DONE_TABS.map((t) => {
          const active = params.status === t.key;
          return (
            <li key={t.key}>
              <Link
                href={href(params, { status: active ? undefined : t.key, open: undefined })}
                aria-current={active ? "true" : undefined}
                className={box(active, TONE_BOX.neutral)}
              >
                <span className="text-sm font-medium">{t.label}</span>
                <span className="text-title font-semibold tabular-nums">{t.statuses.reduce((n, s) => n + counts[s], 0)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <InboxSearch q={params.q ?? ""} base={new URLSearchParams(clean({ ...params, q: undefined, open: undefined })).toString()} />
        </div>
        <nav aria-label="מיון" className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-full bg-subtle p-1">
          <span className="ps-3 pe-1 text-sm text-muted">מיון:</span>
          {INBOX_SORTS.map((o) => {
            const active = parseInboxSort(params.sort) === o.key;
            return (
              <Link
                key={o.key}
                href={href(params, { sort: o.key === "action" ? undefined : o.key, open: undefined })}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-11 items-center rounded-full px-4 text-sm whitespace-nowrap ${
                  active ? "bg-surface font-semibold text-brand-strong shadow-sm" : "text-muted hover:bg-subtle-hover"
                }`}
              >
                {o.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function OrderCard({ order, params, now }: { order: AdminOrderSummary; params: Params; now: number }) {
  const open = params.open === order.id;
  const style = STATUS_STYLE[order.view.status];
  const mine = NEEDS_ADMIN.has(order.view.status);
  const selectable = order.view.status === "to_order" && order.vendorsToOrder.length > 0;
  return (
    <OrderCardShell
      orderId={order.id}
      status={order.view.status}
      version={`${order.itemCount}:${order.unitCount}:${order.totalIls}:${order.view.progress ?? ""}:${order.view.vendors ?? ""}`}
      edgeClass={style.edge}
      initialOpen={open}
      serverPanel={open ? <OrderPanel orderId={order.id} status={order.view.status} edit={params.edit === "1"} /> : null}
      checkbox={
        selectable ? (
          <label className="flex w-11 shrink-0 cursor-pointer items-start justify-center pt-4 ps-2" title="בחירה לסימון מרוכז">
            <input type="checkbox" form={BULK_FORM} name="orderId" value={order.id} className="size-5 accent-brand" aria-label={`בחירת הזמנה #${order.number} לסימון מרוכז`} />
          </label>
        ) : null
      }
      head={
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">
              <TeamName team={{ name: order.teamName, program: order.teamProgram, number: order.teamNumber }} />
            </div>
            <div className="text-sm text-muted">
              הזמנה <Ltr>#{order.number}</Ltr>, <Ltr>{formatDay(order.submittedAt, new Date(now))}</Ltr>, {age(order.submittedAt, now)}
            </div>
          </div>
          <OrderStatusTag status={order.view.status} audience="admin" />
        </div>
      }
      meta={
        <span className="text-muted">
          {countOf(order.itemCount, ITEM, "compact")}, {units(order.unitCount)}, {formatIls(order.totalIls)}
          {order.supplierNames.length > 0 && (
            <>
              , <Ltr>{order.supplierNames.join(", ")}</Ltr>
            </>
          )}
        </span>
      }
      action={
        mine ? (
          <span className="btn-brand flex min-h-11 items-center rounded-full px-5 text-sm font-medium">{MAIN_ACTION[order.view.status]}</span>
        ) : (
          <span className="flex min-h-11 items-center text-sm text-brand">{MAIN_ACTION[order.view.status]}</span>
        )
      }
      chips={
        order.view.progress || order.view.vendors ? (
          <div className="flex flex-wrap gap-2 text-caption">
            {order.view.progress && <span className="rounded-full bg-subtle px-3 py-1">{order.view.progress}</span>}
            {order.view.vendors && <span className="rounded-full bg-subtle px-3 py-1">{order.view.vendors}</span>}
          </div>
        ) : null
      }
    />
  );
}

async function AllOrders({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdmin();
  const params = await searchParams;
  const now = new Date().getTime();
  const everything = await getOrderSummaries();
  const all = everything.filter((o) => !isFinished(o.view.status));
  const q = params.q ?? "";
  const counts = countByStatus(everything);
  const doneTab = DONE_TABS.find((t) => t.key === params.status);
  const sort = parseInboxSort(params.sort);
  // The open card stays in the list after its action moves it out of the filter.
  const keep = (o: AdminOrderSummary) => o.id === params.open || matches(o, q);
  let groups: { heading: string; orders: AdminOrderSummary[] }[];
  if (doneTab) {
    const done = everything.filter((o) => (doneTab.statuses as readonly OrderStatusKey[]).includes(o.view.status) && keep(o));
    groups = done.length ? [{ heading: doneTab.label, orders: [...done].reverse() }] : [];
  } else {
    const shown = all.filter((o) => o.id === params.open || ((!params.status || o.view.status === params.status) && matches(o, q)));
    groups = groupInbox(shown, sort);
    // A search under "פתוחות" still finds an order that is over.
    const over = q.trim() && !params.status ? everything.filter((o) => isFinished(o.view.status) && matches(o, q)).reverse() : [];
    if (over.length) groups.push({ heading: "הזמנות שהסתיימו", orders: over });
  }
  const vendors = new Map<string, { id: string; name: string; orderIds: string[] }>();
  for (const o of all.filter((o) => o.view.status === "to_order"))
    for (const v of o.vendorsToOrder) {
      const entry = vendors.get(v.id) ?? { ...v, orderIds: [] };
      entry.orderIds.push(o.id);
      vendors.set(v.id, entry);
    }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

  return (
    <div className="flex flex-col gap-6">
      <Filters params={params} counts={counts} total={all.length} />

      {groups.length === 0 ? (
        <p className="text-muted">{params.q ? "אין הזמנות שמתאימות לחיפוש." : doneTab ? doneTab.empty : params.status ? "אין הזמנות שמתאימות לסינון." : "אין הזמנות פתוחות."}</p>
      ) : (
        groups.map((g) => (
          <section key={g.heading} className="flex flex-col gap-3" aria-label={g.heading}>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
              {g.heading} <span className="text-base font-normal text-muted tabular-nums">({g.orders.length})</span>
            </h2>
            <ul className="flex flex-col gap-3">
              {g.orders.map((o) => (
                <OrderCard key={o.id} order={o} params={params} now={now} />
              ))}
            </ul>
          </section>
        ))
      )}

      <BulkOrdered vendors={[...vendors.values()]} today={today} />

    </div>
  );
}

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <div>
      <h1 className="mb-6 text-title font-semibold tracking-[-0.02em]">כל ההזמנות</h1>
      <Suspense>
        <GoLiveBanner />
      </Suspense>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <AllOrders searchParams={searchParams as Promise<Params>} />
      </Suspense>
    </div>
  );
}
