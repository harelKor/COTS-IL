"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Copy, ShoppingCart } from "lucide-react";
import { Alert, Button } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { showToast } from "@/components/toast";
import { batchOrderCount, selectBatch } from "@/domain/admin-orders";
import { describeOptions, poTotalUsd, shopifyCartUrl, skuList, type ConsolidatedLine } from "@/domain/purchasing";
import { sendVendorBatch, type PoFormState } from "./actions";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const relative = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

/**
 * One vendor's cart: every approved part still to order, merged per part, each
 * linked to the team orders it serves. Unticking a part or an order leaves it out of this batch.
 */
export function VendorBatch({
  supplier,
  lines,
  oldest,
  today,
  now,
}: {
  supplier: { id: string; name: string; platform: string; baseUrl: string };
  lines: ConsolidatedLine[];
  /** When the oldest waiting order was sent, as ms. */
  oldest: number;
  today: string;
  now: number;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(sendVendorBatch, {} as PoFormState);
  const batch = useMemo(() => selectBatch(lines, excluded), [lines, excluded]);

  const toggle = (ids: string[], include: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (include) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const total = poTotalUsd(batch.map((l) => ({ qty: l.qty, unitCostUsd: l.costUsd })));
  const days = Math.max(0, Math.floor((now - oldest) / 86_400_000));

  return (
    <section id={`v-${supplier.id}`} className="card-surface scroll-mt-20 overflow-hidden rounded-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-subtle p-4">
        <div>
          <h3 className="text-xl font-semibold">
            <Ltr>{supplier.name}</Ltr>
          </h3>
          <p className="text-sm text-muted">
            <Ltr>{usd.format(total)}</Ltr>, {batchOrderCount(batch)} הזמנות, הממתינה הוותיקה {relative.format(-days, "day")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {supplier.platform === "shopify" && batch.length > 0 && (
            <a
              href={shopifyCartUrl(supplier.baseUrl, batch)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-brand flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium"
            >
              <ShoppingCart size={18} aria-hidden /> פתיחת סל
            </a>
          )}
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(skuList(batch)).then(() => showToast("רשימת המק״טים הועתקה"))}
            className="flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm"
          >
            <Copy size={18} aria-hidden /> העתקת רשימת מק״טים
          </button>
        </div>
      </div>

      <ul className="flex flex-col">
        {lines.map((line) => {
          const ids = line.allocations.map((a) => a.orderItemId);
          const included = ids.some((id) => !excluded.has(id));
          return (
            <li key={line.variantId} className="flex flex-col gap-2 border-t border-line p-4 first:border-t-0">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={included}
                  onChange={(e) => toggle(ids, e.target.checked)}
                  aria-label={`לכלול את ${line.title} באצווה`}
                  className="mt-1 size-5 shrink-0 accent-brand"
                />
                <div className={`min-w-0 flex-1 ${included ? "" : "opacity-50"}`}>
                  <div dir="ltr" className="text-start">
                    <div className="font-medium">{line.title}</div>
                    <div className="text-caption text-muted">
                      {[line.supplierSku ?? "no supplier SKU", describeOptions(line.options)].filter(Boolean).join(", ")}
                    </div>
                  </div>
                  <div className="text-sm">
                    כמות {line.allocations.filter((a) => !excluded.has(a.orderItemId)).reduce((s, a) => s + a.qty, 0)}
                    {line.costUsd && (
                      <>
                        , <Ltr>{usd.format(Number(line.costUsd))}</Ltr> ליחידה
                      </>
                    )}
                  </div>
                </div>
              </div>
              <ul className="flex flex-wrap gap-2 ps-8">
                {line.allocations.map((a) => {
                  const on = !excluded.has(a.orderItemId);
                  return (
                    <li key={a.orderItemId} className={`flex items-center rounded-full ${on ? "bg-brand-soft" : "bg-subtle opacity-60"}`}>
                      <label className="flex min-h-11 items-center ps-3">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => toggle([a.orderItemId], e.target.checked)}
                          aria-label={`לכלול את הזמנה ${a.orderNumber} באצווה`}
                          className="size-4 accent-brand"
                        />
                      </label>
                      <Link href={`/admin?open=${a.orderId}`} className="flex min-h-11 items-center px-3 text-caption font-medium text-brand-strong">
                        <Ltr>{`${a.teamLabel} #${a.orderNumber} ×${a.qty}`}</Ltr>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      <form
        action={(fd) => {
          action(fd);
          setExcluded(new Set());
        }}
        className="flex flex-col gap-2 border-t border-line bg-subtle p-4"
      >
        {state.error && <Alert>{state.error}</Alert>}
        <input type="hidden" name="supplierId" value={supplier.id} />
        {batch.flatMap((l) => l.allocations.map((a) => <input key={a.orderItemId} type="hidden" name="orderItemId" value={a.orderItemId} />))}
        <div className="flex flex-wrap gap-2">
          <input
            name="supplierOrderRef"
            required
            placeholder="מספר הזמנה אצל הספק"
            aria-label="מספר הזמנה אצל הספק"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-base"
          />
          <input
            name="orderedAt"
            type="date" lang="he-IL"
            required
            defaultValue={today}
            aria-label="תאריך ההזמנה"
            className="h-11 rounded-full border border-line bg-surface px-4 text-base"
          />
          <Button disabled={pending || batch.length === 0}>{pending ? "שומר…" : "סימון כהוזמן מהספק"}</Button>
        </div>
        <p className="text-caption text-muted">מעדכן את כל {batchOrderCount(batch)} ההזמנות שבאצווה.</p>
      </form>
    </section>
  );
}
