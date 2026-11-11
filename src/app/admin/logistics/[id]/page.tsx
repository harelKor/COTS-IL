import { formatIls } from "@/domain/pricing";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input, Select } from "@/components/form";
import { formatDateTime } from "@/components/orders";
import { describeOptions } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getShipment } from "@/lib/logistics";
import { addImportCost, deleteShipment, receiveShipment, removeImportCost, reverseReceipt, setAllocations } from "../actions";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "משלוח" };

const COST_LABELS = { customs: "מכס", freight: "הובלה", broker: "עמיל מכס", vat: "מע״מ יבוא" } as const;

const smallInput = "h-11 rounded-xl border border-line bg-surface px-2 text-sm";

async function Shipment({ params }: PageProps<"/admin/logistics/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getShipment(id);
  if (!result) notFound();

  const { shipment, po, supplierName, items, receiptRows, shares, allocations, costs } = result;
  const titleOf = new Map(items.map((i) => [i.poLineId, i]));

  const received = new Map<string, number>();
  for (const row of receiptRows) received.set(row.poLineId, (received.get(row.poLineId) ?? 0) + row.qtyReceived);
  const open = items
    .map((item) => ({ ...item, open: item.shipped - (received.get(item.poLineId) ?? 0) }))
    .filter((item) => item.open > 0);

  const costTotal = costs.reduce((sum, c) => sum + Number(c.amountIls), 0);
  const receiptGroups = [...Map.groupBy(receiptRows, (r) => r.receiptId)];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title font-semibold">משלוח {shipment.number}</h1>
        <p className="text-sm text-muted">
          <Link href={`/admin/purchasing/${po.id}`} className="hover:text-brand">
            הזמנת ספק {po.number}, <span className="ltr">{supplierName}</span>
          </Link>
          {(shipment.carrier || shipment.tracking) && (
            <>
              , <span className="ltr">{[shipment.carrier, shipment.tracking].filter(Boolean).join(" ")}</span>
            </>
          )}
        </p>
        {shipment.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{shipment.notes}</p>}
      </div>

      {open.length > 0 && (
        <ActionForm action={receiveShipment} className="flex flex-col gap-3 card-surface p-4">
          <h2 className="font-semibold">קליטה</h2>
          <p className="text-sm text-muted">
            אפשר לקלוט חלק מהכמות. יחידות תקינות מוקצות אוטומטית להזמנות הוותיקות קודם, ואפשר לשנות את זה אחר כך.
          </p>
          <input type="hidden" name="shipmentId" value={shipment.id} />
          {open.map((item) => (
            <div key={item.poLineId} className="flex flex-col gap-2 border-t border-line pt-3">
              <div dir="ltr" className="text-start text-sm">
                <div className="font-medium">{item.title}</div>
                <div className="text-caption text-muted">
                  {[describeOptions(item.options), item.supplierSku ?? "no supplier SKU"].filter(Boolean).join(", ")}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-caption">
                <span className="text-muted">יתרה במשלוח: {item.open}</span>
                <label className="flex items-center gap-1">
                  התקבל
                  <input
                    name={`received:${item.poLineId}`}
                    type="number"
                    min={0}
                    max={item.open}
                    defaultValue={item.open}
                    className={`${smallInput} w-20`}
                  />
                </label>
                <label className="flex items-center gap-1">
                  מתוכם פגומים
                  <input
                    name={`damaged:${item.poLineId}`}
                    type="number"
                    min={0}
                    defaultValue={0}
                    className={`${smallInput} w-20`}
                  />
                </label>
                <label className="flex items-center gap-1">
                  מיקום
                  <input name={`location:${item.poLineId}`} maxLength={100} className={`${smallInput} w-32`} />
                </label>
              </div>
            </div>
          ))}
          <Field label="הערות" name="notes">
            <Input name="notes" maxLength={2000} />
          </Field>
          <Button>שמירת הקליטה</Button>
        </ActionForm>
      )}

      {receiptGroups.map(([receiptId, rows]) => (
        <section key={receiptId} className="flex flex-col gap-3 card-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">
              קליטה, <span className="ltr">{formatDateTime(rows[0].receivedAt)}</span>
            </h2>
            <ActionForm action={reverseReceipt}>
              <input type="hidden" name="receiptId" value={receiptId} />
              <button className="text-caption text-danger hover:underline">ביטול הקליטה</button>
            </ActionForm>
          </div>
          {rows[0].notes && <p className="text-sm">{rows[0].notes}</p>}
          {rows.map((row) => {
            const good = row.qtyReceived - row.qtyDamaged;
            const lineShares = shares.filter((s) => s.poLineId === row.poLineId);
            const here = allocations.filter((a) => a.receiptLineId === row.lineId);
            const allocated = here.reduce((sum, a) => sum + a.qty, 0);
            return (
              <ActionForm key={row.lineId} action={setAllocations} className="flex flex-col gap-2 border-t border-line pt-3">
                <input type="hidden" name="receiptLineId" value={row.lineId} />
                <div dir="ltr" className="text-start text-sm font-medium">
                  {titleOf.get(row.poLineId)?.title}
                </div>
                <div className="flex flex-wrap gap-x-3 text-caption text-muted">
                  <span>התקבל: {row.qtyReceived}</span>
                  {row.qtyDamaged > 0 && <span className="text-warning">פגומים: {row.qtyDamaged}</span>}
                  {row.location && <span>מיקום: {row.location}</span>}
                  {good > allocated && <span className="text-warning">לא הוקצו: {good - allocated}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-caption">
                  {lineShares.map((share) => {
                    const mine = here.find((a) => a.orderItemId === share.orderItemId);
                    return (
                      <label key={share.orderItemId} className="flex items-center gap-1">
                        <span className="ltr">{`${share.teamProgram} ${share.teamNumber} #${share.orderNumber}`}</span>
                        <span className="text-muted">(הוזמן {share.share})</span>
                        <input
                          name={`qty:${share.orderItemId}`}
                          type="number"
                          min={mine?.delivered ?? 0}
                          defaultValue={mine?.qty ?? 0}
                          className={`${smallInput} w-16`}
                        />
                      </label>
                    );
                  })}
                  <button className="btn-soft min-h-11 rounded-full px-4">עדכון הקצאה</button>
                </div>
              </ActionForm>
            );
          })}
        </section>
      ))}

      <section className="flex flex-col gap-3 card-surface p-4">
        <h2 className="font-semibold">עלויות יבוא</h2>
        {costs.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {costs.map((cost) => (
              <li key={cost.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-1">
                <span>
                  {COST_LABELS[cost.type]}
                  {cost.vatReclaimable && <span className="text-caption text-muted"> (בר קיזוז)</span>}
                  {cost.reference && <span className="ltr text-caption text-muted"> {cost.reference}</span>}
                </span>
                <span className="flex items-center gap-3">
                  {formatIls(Number(cost.amountIls))}
                  <form action={removeImportCost}>
                    <input type="hidden" name="id" value={cost.id} />
                    <button className="text-caption text-danger hover:underline">הסרה</button>
                  </form>
                </span>
              </li>
            ))}
            <li className="flex justify-between pt-1 font-semibold">
              <span>סה״כ</span>
              <span>{formatIls(costTotal)}</span>
            </li>
          </ul>
        )}
        <ActionForm action={addImportCost} className="flex flex-col gap-3">
          <input type="hidden" name="shipmentId" value={shipment.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="סוג" name="type">
              <Select name="type">
                {Object.entries(COST_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="סכום ₪" name="amountIls">
              <Input name="amountIls" type="number" min={0} step="0.01" required />
            </Field>
            <Field label="אסמכתא" name="reference">
              <Input name="reference" dir="ltr" maxLength={200} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="vatReclaimable" />
            מע״מ בר קיזוז (לא נספר כעלות ברווחיות)
          </label>
          <Button variant="secondary" className="self-start">
            הוספת עלות
          </Button>
        </ActionForm>
      </section>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/admin/purchasing#sent" className="text-brand hover:underline">
          לכל המשלוחים
        </Link>
        <Link href="/admin/deliveries" className="text-brand hover:underline">
          למסירות
        </Link>
        {receiptRows.length === 0 && (
          <form action={deleteShipment}>
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <button className="text-danger hover:underline">מחיקת המשלוח</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ShipmentPage(props: PageProps<"/admin/logistics/[id]">) {
  return (
    <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
      <Shipment {...props} />
    </Suspense>
  );
}
