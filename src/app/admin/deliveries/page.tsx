import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/form";
import { formatDateTime } from "@/components/orders";
import { Ltr } from "@/components/ltr";
import { OrderStatusTag } from "@/components/order-status-tag";
import { deliveryLabel } from "@/domain/order-status";
import { countOf, ITEM } from "@/domain/plural";
import { describeOptions } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getOpenDeliveries, getReadyToDeliver, listDeliveries } from "@/lib/logistics";
import { confirmDelivery, createDelivery } from "./actions";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { TeamName } from "@/components/team-name";

export const metadata: Metadata = { title: "מסירות" };

type Ready = Awaited<ReturnType<typeof getReadyToDeliver>>[number];
type OpenNote = Awaited<ReturnType<typeof getOpenDeliveries>>[number];

const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

/** A note that is printed but not handed over yet: its lines and the one action left (A-02). */
function NoteCard({ note }: { note: OpenNote }) {
  return (
    <section className="flex flex-col gap-3 card-surface p-4" aria-label={`תעודה ${note.number}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">
          <TeamName team={{ name: note.teamName, program: note.teamProgram, number: note.teamNumber }} />
        </h3>
        <OrderStatusTag status="to_team" audience="admin" />
      </div>
      <p className="text-sm text-muted">
        <Link href={`/admin/deliveries/${note.id}`} className="text-brand hover:underline">
          תעודה <Ltr>#{note.number}</Ltr>
        </Link>
        , {note.method === "ship" ? `משלוח לכתובת: ${note.address ?? ""}` : "איסוף עצמי"}, {countOf(note.items.length, ITEM)}
      </p>
      <ul className="flex flex-col">
        {note.items.map((row) => (
          <li key={row.allocationId} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2">
            <div dir="ltr" className="min-w-48 flex-1 text-start text-sm">
              <div className="font-medium">{row.title}</div>
              <div className="text-caption text-muted">
                {[describeOptions(row.options), row.supplierSku ?? "no supplier SKU", `#${row.orderNumber}`].filter(Boolean).join(", ")}
              </div>
            </div>
            <span className="text-sm tabular-nums">כמות {row.qty}</span>
          </li>
        ))}
      </ul>
      <ActionForm action={confirmDelivery} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <input type="hidden" name="deliveryId" value={note.id} />
        <Field label="שם המקבל" name={`recipient-${note.id}`}>
          <Input id={`recipient-${note.id}`} name="recipientName" required minLength={2} maxLength={100} defaultValue={note.contactName} />
        </Field>
        <Field label="תאריך" name={`delivered-${note.id}`}>
          <Input id={`delivered-${note.id}`} name="deliveredAt" type="date" lang="he-IL" required defaultValue={isoDay.format(new Date())} />
        </Field>
        <Button>סימון כנמסר</Button>
      </ActionForm>
    </section>
  );
}

function TeamBoard({ rows }: { rows: Ready[] }) {
  const [first] = rows;
  const shipping = rows.find((r) => r.deliveryMethod === "ship");
  return (
    <ActionForm action={createDelivery} className="flex flex-col gap-3 card-surface p-4">
      <h3 className="font-semibold">
        <TeamName team={{ name: first.teamName, program: first.teamProgram, number: first.teamNumber }} />
      </h3>
      <input type="hidden" name="teamId" value={first.teamId} />
      <ul className="flex flex-col">
        {rows.map((row) => {
          const available = row.qty - row.delivered;
          return (
            <li key={row.allocationId} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2">
              <div dir="ltr" className="min-w-48 flex-1 text-start text-sm">
                <div className="font-medium">{row.title}</div>
                <div className="text-caption text-muted">
                  {[describeOptions(row.options), row.supplierSku ?? "no supplier SKU", `#${row.orderNumber}`, row.location]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
              <label className="flex items-center gap-1 text-caption">
                למסירה (עד {available})
                <input
                  name={`qty:${row.allocationId}`}
                  type="number"
                  min={0}
                  max={available}
                  defaultValue={available}
                  className="h-11 w-20 rounded-xl border border-line bg-surface px-2 text-sm"
                />
              </label>
            </li>
          );
        })}
      </ul>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="method" value="pickup" defaultChecked={!shipping} />
          איסוף עצמי
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="method" value="ship" defaultChecked={!!shipping} />
          משלוח
        </label>
      </fieldset>
      <Field label="כתובת למשלוח" name="address">
        <Input name="address" defaultValue={shipping?.address ?? ""} />
      </Field>
      <Button className="self-start">הפקת תעודת משלוח</Button>
    </ActionForm>
  );
}

async function Deliveries() {
  await requireAdmin();
  const [ready, notes, list] = await Promise.all([getReadyToDeliver(), getOpenDeliveries(), listDeliveries()]);
  const byTeam = [...Map.groupBy(ready, (r) => r.teamId)];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">מוכן למסירה</h2>
        {byTeam.length === 0 && notes.length === 0 && <p className="text-muted">אין כרגע פריטים שמחכים למסירה.</p>}
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
        {byTeam.length > 0 && notes.length > 0 && <h3 className="mt-2 text-callout font-semibold">עוד בלי תעודה</h3>}
        {byTeam.map(([teamId, rows]) => (
          <TeamBoard key={teamId} rows={rows} />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">תעודות משלוח</h2>
        {list.length === 0 ? (
          <p className="text-muted">עדיין אין תעודות.</p>
        ) : (
          <div className="overflow-x-auto card-surface">
            <table className="w-full text-sm">
              <thead className="bg-subtle text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">תעודה</th>
                  <th className="px-4 py-2 text-start font-medium">קבוצה</th>
                  <th className="px-4 py-2 text-start font-medium">נוצרה</th>
                  <th className="px-4 py-2 text-start font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {list.map(({ delivery, teamName, teamProgram, teamNumber }) => (
                  <tr key={delivery.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <Link href={`/admin/deliveries/${delivery.id}`} className="text-brand hover:underline">
                        {delivery.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <TeamName team={{ name: teamName, program: teamProgram, number: teamNumber }} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className="ltr">{formatDateTime(delivery.createdAt)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{deliveryLabel(delivery.status, "admin")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-title font-semibold">מסירות</h1>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          לניהול
        </Link>
      </div>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Deliveries />
      </Suspense>
    </div>
  );
}
