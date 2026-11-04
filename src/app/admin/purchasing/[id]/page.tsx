import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { describeOptions, poTotalUsd, shopifyCartUrl, skuList } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getPoShipping } from "@/lib/logistics";
import { getPo } from "@/lib/purchasing";
import { createShipment } from "../../logistics/actions";
import { removePoLine } from "../actions";
import { PO_STATUS_LABELS } from "../status";
import { CancelPoForm, RecordOrderedForm } from "./po-forms";

export const metadata: Metadata = { title: "הזמנת ספק | פורטל רכש FIRST" };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Jerusalem" });
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

async function Po({ params }: PageProps<"/admin/purchasing/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getPo(id);
  if (!result) notFound();

  const { po, supplier, lines } = result;
  const isDraft = po.status === "draft";
  const shipping = await getPoShipping(po.id);
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
            className="inline-flex h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-subtle"
          >
            Excel
          </a>
          <PrintButton />
        </div>
      </div>

      {/* The document itself is in English, since it goes to the supplier. */}
      <section dir="ltr" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 text-start print:border-0 print:p-0">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Purchase Order {po.number}</h1>
            <p className="text-sm text-muted">Supplier: {supplier.name}</p>
          </div>
          <div className="text-end text-sm">
            <div>Created: {usDate.format(po.createdAt)}</div>
            {po.orderedAt && <div>Ordered: {usDate.format(po.orderedAt)}</div>}
            {po.supplierOrderRef && <div>Supplier order: {po.supplierOrderRef}</div>}
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
                <th className="p-2 text-start font-medium print:hidden">Teams</th>
                {isDraft && <th className="p-2 print:hidden" />}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap p-2 text-xs">{line.supplierSku ?? "no supplier SKU"}</td>
                  <td className="p-2">
                    <a href={line.productUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand">
                      {line.title}
                    </a>
                    {line.options.length > 0 && <div className="text-xs text-muted">{describeOptions(line.options)}</div>}
                  </td>
                  <td className="p-2 font-semibold">{line.qty}</td>
                  <td className="whitespace-nowrap p-2">{usd.format(Number(line.unitCostUsd ?? 0))}</td>
                  <td className="whitespace-nowrap p-2">{usd.format(line.qty * Number(line.unitCostUsd ?? 0))}</td>
                  <td className="p-2 text-xs print:hidden">
                    {line.allocations.map((a) => (
                      <div key={`${a.orderId}`}>
                        <Link href={`/admin/orders/${a.orderId}`} className="hover:text-brand">
                          {a.teamProgram} {a.teamNumber} #{a.orderNumber}
                        </Link>
                        : {a.qty}
                      </div>
                    ))}
                  </td>
                  {isDraft && (
                    <td className="p-2 print:hidden">
                      <form action={removePoLine}>
                        <input type="hidden" name="lineId" value={line.id} />
                        <button className="text-xs text-danger hover:underline">Remove</button>
                      </form>
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

      {isDraft && lines.length > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 print:hidden">
          <h2 className="font-semibold">ביצוע ההזמנה באתר הספק</h2>
          {supplier.platform === "shopify" && (
            <a
              href={shopifyCartUrl(supplier.baseUrl, lines)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-fit items-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong"
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
              className="rounded-md border border-line bg-subtle p-2 font-mono text-xs"
            />
          </label>
          <p className="text-xs text-muted">בדקו את הסל באתר הספק לפני התשלום. המחירים כאן הם מהסנכרון האחרון.</p>
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

      {po.status === "ordered" && (
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 print:hidden">
          <h2 className="font-semibold">משלוחים</h2>
          {shipping.shipments.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {shipping.shipments.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/logistics/${s.id}`} className="text-brand hover:underline">
                    משלוח {s.number}
                  </Link>{" "}
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
                      className="h-9 w-24 shrink-0 rounded-md border border-line bg-surface px-2 text-sm"
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
    <Suspense fallback={<p className="text-muted">טוען…</p>}>
      <Po {...props} />
    </Suspense>
  );
}
