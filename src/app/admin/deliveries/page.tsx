import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/form";
import { formatDateTime } from "@/components/orders";
import { describeOptions } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getReadyToDeliver, listDeliveries } from "@/lib/logistics";
import { createDelivery } from "./actions";

export const metadata: Metadata = { title: "מסירות | פורטל רכש FIRST" };

type Ready = Awaited<ReturnType<typeof getReadyToDeliver>>[number];

function TeamBoard({ rows }: { rows: Ready[] }) {
  const [first] = rows;
  const shipping = rows.find((r) => r.deliveryMethod === "ship");
  return (
    <ActionForm action={createDelivery} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <h3 className="font-semibold">
        {first.teamName} · <span className="ltr">{`${first.teamProgram} ${first.teamNumber}`}</span>
      </h3>
      <input type="hidden" name="teamId" value={first.teamId} />
      <ul className="flex flex-col">
        {rows.map((row) => {
          const available = row.qty - row.delivered;
          return (
            <li key={row.allocationId} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2">
              <div dir="ltr" className="min-w-48 flex-1 text-start text-sm">
                <div className="font-medium">{row.title}</div>
                <div className="text-xs text-muted">
                  {[describeOptions(row.options), row.supplierSku ?? "no supplier SKU", `#${row.orderNumber}`, row.location]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <label className="flex items-center gap-1 text-xs">
                למסירה (עד {available})
                <input
                  name={`qty:${row.allocationId}`}
                  type="number"
                  min={0}
                  max={available}
                  defaultValue={available}
                  className="h-9 w-20 rounded-md border border-line bg-surface px-2 text-sm"
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
  const [ready, list] = await Promise.all([getReadyToDeliver(), listDeliveries()]);
  const byTeam = [...Map.groupBy(ready, (r) => r.teamId)];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">מוכן למסירה</h2>
        {byTeam.length === 0 ? (
          <p className="text-muted">אין כרגע פריטים שהוקצו וממתינים למסירה.</p>
        ) : (
          byTeam.map(([teamId, rows]) => <TeamBoard key={teamId} rows={rows} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">תעודות משלוח</h2>
        {list.length === 0 ? (
          <p className="text-muted">עדיין אין תעודות.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
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
                      {teamName} · <span className="ltr">{`${teamProgram} ${teamNumber}`}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span className="ltr">{formatDateTime(delivery.createdAt)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{delivery.status === "delivered" ? "נמסרה" : "ממתינה למסירה"}</td>
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
        <h1 className="text-2xl font-bold">מסירות</h1>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          לניהול
        </Link>
      </div>
      <Suspense fallback={<p className="text-muted">טוען…</p>}>
        <Deliveries />
      </Suspense>
    </div>
  );
}
