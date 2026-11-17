import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { describeOptions, poCostUsd, poMargin, poTotalUsd, shopifyCartUrl, skuList } from "@/domain/purchasing";
import { formatIls } from "@/domain/pricing";
import { usdIlsRate } from "@/lib/fx";
import { requireAdmin } from "@/lib/auth";
import { getPoShipping } from "@/lib/logistics";
import { getPo, getPoRevenueIls, getPoUpdatedAt } from "@/lib/purchasing";
import { formatDay } from "@/domain/display";
import { Ltr } from "@/components/ltr";
import { createShipment } from "../../logistics/actions";
import { ShipmentTag } from "@/components/order-status-tag";
import { PO_STATUS_LABELS } from "../status";
import { CancelPoForm, PoRecordForm, RecordOrderedForm, RemoveLineButton } from "./po-forms";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { PoLineUnavailable } from "../../orders/[id]/order-actions";

export const metadata: Metadata = { title: "הזמנת ספק" };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Jerusalem" });
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

/** "עלות / הכנסה": what this order cost in shekels at today's rate, against what its teams were quoted. */
async function PoMargin({ po, linesUsd }: { po: Parameters<typeof poCostUsd>[1] & { id: string }; linesUsd: number }) {
  const [rate, revenueIls] = await Promise.all([usdIlsRate(), getPoRevenueIls(po.id)]);
  const costUsd = poCostUsd(linesUsd, po);
  const m = poMargin(costUsd, rate, revenueIls);
  return (
    <section className="flex flex-wrap items-baseline gap-x-6 gap-y-1 card-surface p-4 text-sm print:hidden">
      <h2 className="font-semibold">עלות / הכנסה</h2>
      <span>
        עלות {formatIls(m.costIls)} <span className="text-muted">({usd.format(costUsd)})</span>
      </span>
      <span>הכנסה מהקבוצות {formatIls(m.revenueIls)}</span>
      <span className={m.marginIls < 0 ? "font-semibold text-danger" : "font-semibold text-success"}>
        {m.marginIls < 0 ? "הפסד" : "רווח"} {formatIls(Math.abs(m.marginIls))}
        {m.marginPct !== null && ` (${m.marginPct}%)`}
      </span>
      {po.totalChargedUsd === null && <span className="text-caption text-muted">לפי השורות, המשלוח והמס. סכום החיוב בפועל מדויק יותר.</span>}
    </section>
  );
}

async function Po({ params }: PageProps<"/admin/purchasing/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getPo(id);
  if (!result) notFound();

  const { po, supplier, lines } = result;
  const isDraft = po.status === "draft";
  const [shipping, updatedAt] = await Promise.all([getPoShipping(po.id), getPoUpdatedAt(po)]);
  const unshipped = lines
    .map((line) => ({ ...line, open: line.qty - (shipping.shipped.get(line.id) ?? 0) }))
    .filter((line) => line.open > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/admin/purchasing" className="text-sm text-brand hover:underline">
            לרכש
          </Link>
          <span className="text-sm text-muted">{PO_STATUS_LABELS[po.status]}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/admin/purchasing/${po.id}/export`}
            className="btn-soft inline-flex min-h-11 items-center rounded-full px-5 text-callout font-medium"
          >
            Excel
          </a>
          <PrintButton />
        </div>
      </div>

      {/* The document itself is in English, since it goes to the supplier. */}
      <section dir="ltr" className="flex flex-col gap-4 card-surface p-5 text-start print:border-0 print:p-0">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-title font-semibold">Purchase Order {po.number}</h1>
            <p className="text-sm text-muted">Supplier: {supplier.name}</p>
          </div>
          <div className="text-end text-sm">
            <div>Created: {usDate.format(po.createdAt)}</div>
            {po.orderedAt && <div>Ordered: {usDate.format(po.orderedAt)}</div>}
            {po.supplierOrderRef && <div>Supplier order: {po.supplierOrderRef}</div>}
            {po.tracking && <div>Tracking: {po.tracking}</div>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-muted">
              <tr>
                <th className="p-2 text-start font-medium">SKU</th>
                <th className="p-2 text-start font-medium">Description</th>
                <th className="p-2 text-start font-medium">Qty</th>
                <th className="p-2 text-start font-medium">Unit</th>
                <th className="p-2 text-start font-medium">Total</th>
                {isDraft && <th className="p-2 print:hidden" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap p-2 text-caption">{line.supplierSku ?? "no supplier SKU"}</td>
                  <td className="p-2">
                    <a href={line.productUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand">
                      {line.title}
                    </a>
                    {line.options.length > 0 && <div className="text-caption text-muted">{describeOptions(line.options)}</div>}
                  </td>
                  <td className="p-2 font-semibold">{line.qty}</td>
                  <td className="whitespace-nowrap p-2">{usd.format(Number(line.unitCostUsd ?? 0))}</td>
                  <td className="whitespace-nowrap p-2">{usd.format(line.qty * Number(line.unitCostUsd ?? 0))}</td>
                  {isDraft && (
                    <td className="p-2 print:hidden">
                      <RemoveLineButton lineId={line.id} label={line.supplierSku ?? line.title} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-semibold">
                <td className="p-2" colSpan={4}>
                  Total
                </td>
                <td className="whitespace-nowrap p-2">{usd.format(poTotalUsd(lines))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {po.notes && <p className="whitespace-pre-wrap text-sm">{po.notes}</p>}
      </section>

      {/* Which team orders each line serves: for the admin only, never on the supplier's copy. */}
      <section className="flex flex-col gap-3 card-surface p-4 print:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">שיוך לקבוצות</h2>
          <span className="text-caption text-muted">
            נוצרה <Ltr>{formatDay(po.createdAt)}</Ltr>, עודכנה <Ltr>{formatDay(updatedAt)}</Ltr>
          </span>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          {lines.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center gap-2">
              <Ltr className="min-w-0 font-medium">{line.supplierSku ?? line.title}</Ltr>
              {line.allocations.map((a) => {
                const surplus = a.orderStatus === "cancelled" || a.orderStatus === "rejected";
                return (
                  <Link
                    key={a.orderId}
                    href={`/admin?open=${a.orderId}`}
                    className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-caption font-medium ${surplus ? "bg-subtle text-muted" : "bg-brand-soft text-brand-strong"}`}
                  >
                    <Ltr>{`${a.teamProgram} ${a.teamNumber} #${a.orderNumber} ×${a.qty}`}</Ltr>
                    {surplus && <span>{a.orderStatus === "cancelled" ? "בוטלה, עודף מלאי" : "נדחתה, עודף מלאי"}</span>}
                  </Link>
                );
              })}
              {line.unassigned > 0 && (
                <span className="inline-flex min-h-11 items-center gap-1 rounded-full bg-subtle px-3 text-caption font-medium text-muted">
                  <Ltr>{`×${line.unassigned}`}</Ltr>
                  <span>ללא קבוצה (ההזמנה נמחקה), עודף מלאי</span>
                </span>
              )}
              {line.allocations.some((a) => a.orderStatus === "submitted" || a.orderStatus === "quote_sent" || a.orderStatus === "approved") && (
                <PoLineUnavailable poLineId={line.id} label={line.supplierSku ?? line.title} unavailable={line.allocations.some((a) => a.unavailable)} />
              )}
            </li>
          ))}
        </ul>
      </section>

      {isDraft && lines.length > 0 && (
        <section className="flex flex-col gap-3 card-surface p-4 print:hidden">
          <h2 className="font-semibold">ביצוע ההזמנה באתר הספק</h2>
          {supplier.platform === "shopify" && (
            <a
              href={shopifyCartUrl(supplier.baseUrl, lines)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-brand inline-flex min-h-11 w-fit items-center rounded-full px-5 text-callout font-semibold"
            >
              פתיחת סל מלא באתר <span className="ltr ms-1">{supplier.name}</span>
            </a>
          )}
          <label className="flex flex-col gap-1 text-sm">
            רשימה להעתקה
            <textarea
              dir="ltr"
              readOnly
              rows={Math.min(lines.length + 1, 10)}
              value={skuList(lines)}
              className="rounded-md border border-line bg-subtle p-2 font-mono text-caption"
            />
          </label>
          <p className="text-caption text-muted">בדקו את הסל באתר הספק לפני התשלום. המחירים כאן הם מהסנכרון האחרון.</p>
        </section>
      )}

      {isDraft && lines.length > 0 && (
        <RecordOrderedForm
          key={lines.map((l) => l.id).join()}
          poId={po.id}
          today={isoDay.format(new Date())}
          lines={lines.map((line) => ({
            id: line.id,
            label: `${line.supplierSku ?? line.title} × ${line.qty}`,
            cost: line.unitCostUsd,
          }))}
        />
      )}

      {po.status === "ordered" && <PoMargin po={po} linesUsd={poTotalUsd(lines)} />}

      {po.status === "ordered" && <PoRecordForm poId={po.id} record={po} />}

      {po.status === "ordered" && (
        <section className="flex flex-col gap-3 card-surface p-4 print:hidden">
          <h2 className="font-semibold">משלוחים</h2>
          {shipping.shipments.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {shipping.shipments.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-2">
                  <Link href={`/admin/logistics/${s.id}`} className="text-brand hover:underline">
                    משלוח {s.number}
                  </Link>
                  <ShipmentTag shipped={s.shipped} received={s.received} />
                  <span className="ltr text-muted">{[s.carrier, s.tracking].filter(Boolean).join(" ")}</span>
                </li>
              ))}
            </ul>
          )}
          {unshipped.length > 0 ? (
            <ActionForm action={createShipment} className="flex flex-col gap-3">
              <input type="hidden" name="poId" value={po.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="חברת שילוח" name="carrier">
                  <Input name="carrier" dir="ltr" maxLength={100} />
                </Field>
                <Field label="מספר מעקב" name="tracking">
                  <Input name="tracking" dir="ltr" maxLength={200} />
                </Field>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">כמות במשלוח הזה (אפשר לפצל)</legend>
                {unshipped.map((line) => (
                  <label key={line.id} className="flex items-center justify-between gap-3 text-sm">
                    <span dir="ltr" className="min-w-0 text-start">
                      {line.supplierSku ?? line.title}
                    </span>
                    <input
                      name={`qty:${line.id}`}
                      type="number"
                      min={0}
                      max={line.open}
                      defaultValue={line.open}
                      className="h-11 w-24 shrink-0 rounded-xl border border-line bg-surface px-2 text-sm"
                    />
                  </label>
                ))}
              </fieldset>
              <Field label="הערות" name="notes">
                <Input name="notes" maxLength={2000} />
              </Field>
              <Button className="self-start">פתיחת משלוח</Button>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">כל הכמויות כבר במשלוחים.</p>
          )}
        </section>
      )}

      {po.status !== "cancelled" && <CancelPoForm poId={po.id} needsReason={po.status === "ordered"} />}
    </div>
  );
}

export default function PoPage(props: PageProps<"/admin/purchasing/[id]">) {
  return (
    <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
      <Po {...props} />
    </Suspense>
  );
}
