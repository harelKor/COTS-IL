import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { Ltr } from "@/components/ltr";
import { formatDateTime } from "@/components/orders";
import { consolidateDemand } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getDemand, listPos } from "@/lib/purchasing";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { PO_STATUS_LABELS } from "./status";
import { VendorBatch } from "./vendor-batch";

export const metadata: Metadata = { title: "הזמנות ספקים" };

const { poAllocations, poLines, receiptLines, shipmentItems, supplierPos, suppliers, teamOrderItems, teamOrders, teams } = schema;

/** For every supplier order: the team orders it serves, and how much has shipped and arrived. */
async function poProgress() {
  const [served, counts] = await Promise.all([
    db
      .selectDistinct({
        poId: poLines.poId,
        orderId: teamOrders.id,
        orderNumber: teamOrders.number,
        teamNumber: teams.number,
      })
      .from(poAllocations)
      .innerJoin(poLines, eq(poLines.id, poAllocations.poLineId))
      .innerJoin(teamOrderItems, eq(teamOrderItems.id, poAllocations.orderItemId))
      .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
      .innerJoin(teams, eq(teams.id, teamOrders.teamId))
      .orderBy(asc(teamOrders.number)),
    db
      .select({
        poId: supplierPos.id,
        ordered: sql<number>`(SELECT coalesce(sum(a.qty), 0)::int FROM ${poAllocations} a JOIN ${poLines} l ON l.id = a.po_line_id WHERE l.po_id = supplier_pos.id)`,
        shipped: sql<number>`(SELECT coalesce(sum(si.qty), 0)::int FROM ${shipmentItems} si JOIN ${poLines} l ON l.id = si.po_line_id WHERE l.po_id = supplier_pos.id)`,
        received: sql<number>`(SELECT coalesce(sum(rl.qty_received), 0)::int FROM ${receiptLines} rl JOIN ${poLines} l ON l.id = rl.po_line_id WHERE l.po_id = supplier_pos.id)`,
      })
      .from(supplierPos),
  ]);
  return { served, counts: new Map(counts.map((c) => [c.poId, c])) };
}

async function Purchasing() {
  await requireAdmin();
  const [demandRows, pos, vendorRows, progress] = await Promise.all([
    getDemand(),
    listPos(),
    db.select({ id: suppliers.id, baseUrl: suppliers.baseUrl }).from(suppliers),
    poProgress(),
  ]);
  const demand = consolidateDemand(demandRows);
  const baseUrl = new Map(vendorRows.map((s) => [s.id, s.baseUrl]));
  const now = new Date().getTime();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

  const sent = pos.filter((p) => p.status === "ordered");
  const drafts = pos.filter((p) => p.status === "draft");
  const isDone = (id: string) => {
    const c = progress.counts.get(id);
    return !!c && c.ordered > 0 && c.received >= c.ordered;
  };

  const PoRow = ({ po }: { po: (typeof pos)[number] }) => {
    const c = progress.counts.get(po.id);
    return (
      <li id={`po-${po.id}`} className="card-surface flex flex-col gap-2 rounded-[18px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/admin/purchasing/${po.id}`} className="font-semibold text-brand hover:underline">
            <Ltr>{`${po.supplierName} #${po.number}`}</Ltr>
          </Link>
          <span className="text-sm text-muted">
            {PO_STATUS_LABELS[po.status]}
            {po.supplierOrderRef && (
              <>
                , <Ltr>{po.supplierOrderRef}</Ltr>
              </>
            )}
            {po.orderedAt && (
              <>
                , <Ltr>{formatDateTime(po.orderedAt).slice(0, 10)}</Ltr>
              </>
            )}
          </span>
        </div>
        {c && (
          <div className="text-sm text-muted">
            נשלחו מהספק {c.shipped} מתוך {c.ordered}, הגיעו {c.received}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {progress.served
            .filter((s) => s.poId === po.id)
            .map((s) => (
              <Link key={s.orderId} href={`/admin?open=${s.orderId}`} className="inline-flex min-h-8 items-center rounded-full bg-brand-soft px-3 text-xs font-medium text-brand-strong">
                <Ltr>{`${s.teamNumber} #${s.orderNumber}`}</Ltr>
              </Link>
            ))}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">להזמין מהספקים</h2>
        {demand.length === 0 ? (
          <p className="text-muted">אין כרגע פריטים מאושרים שממתינים להזמנה.</p>
        ) : (
          demand.map((d) => (
            <VendorBatch
              key={d.supplierId}
              supplier={{ id: d.supplierId, name: d.supplierName, platform: d.platform, baseUrl: baseUrl.get(d.supplierId) ?? "" }}
              lines={d.lines}
              oldest={Math.min(...d.lines.flatMap((l) => l.allocations.map((a) => a.submittedAt?.getTime() ?? now)))}
              today={today}
              now={now}
            />
          ))
        )}
      </section>

      {drafts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">טיוטות</h2>
          <ul className="flex flex-col gap-3">
            {drafts.map((po) => (
              <PoRow key={po.id} po={po} />
            ))}
          </ul>
        </section>
      )}

      <section id="sent" className="flex flex-col gap-3 scroll-mt-20">
        <h2 className="text-xl font-semibold">הזמנות ספק שנשלחו</h2>
        {sent.filter((p) => !isDone(p.id)).length === 0 ? (
          <p className="text-muted">אין הזמנות ספק בדרך.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sent
              .filter((p) => !isDone(p.id))
              .map((po) => (
                <PoRow key={po.id} po={po} />
              ))}
          </ul>
        )}
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center rounded-full bg-subtle px-4 font-semibold hover:bg-subtle-hover">
            הזמנות ספק שהסתיימו ({pos.filter((p) => p.status === "cancelled" || (p.status === "ordered" && isDone(p.id))).length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {pos
              .filter((p) => p.status === "cancelled" || (p.status === "ordered" && isDone(p.id)))
              .map((po) => (
                <PoRow key={po.id} po={po} />
              ))}
          </ul>
        </details>
        <p className="text-sm">
          <Link href="/admin/shortages" className="text-brand hover:underline">
            דוח חוסרים
          </Link>
        </p>
      </section>
    </div>
  );
}

export default function PurchasingPage() {
  return (
    <div>
      <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em]">הזמנות ספקים</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Purchasing />
      </Suspense>
    </div>
  );
}
