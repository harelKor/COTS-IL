import { LINE_LABELS, lineStatus, type LineFacts } from "@/domain/order-status";
import { formatIls } from "@/domain/pricing";
import { diffQuoteLines, quoteTotals, type QuoteLine } from "@/domain/orders";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jerusalem",
});

export const formatDateTime = (date: Date) => dateTime.format(date);

export type OrderItem = {
  id: string;
  title: string;
  supplierName: string;
  supplierSku: string | null;
  options: { name: string; value: string }[];
  qty: number;
  unitPriceIls: number;
};

export function ItemDescription({ item }: { item: Pick<OrderItem, "title" | "supplierName" | "supplierSku" | "options"> }) {
  return (
    <div dir="ltr" className="text-start">
      <div className="font-medium">{item.title}</div>
      {item.options.length > 0 && <div className="text-caption">{item.options.map((o) => o.value).join(" / ")}</div>}
      <div className="text-caption text-muted">
        {item.supplierName}, {item.supplierSku ?? "no supplier SKU"}
      </div>
    </div>
  );
}

/** What the team asked for, before any quote exists. */
export function RequestTable({ items }: { items: OrderItem[] }) {
  const { subtotal } = quoteTotals(items, 0);
  return (
    <div className="overflow-x-auto card-surface">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-muted">
          <tr>
            <th className="p-3 text-start font-medium">פריט</th>
            <th className="p-3 text-start font-medium">כמות</th>
            <th className="p-3 text-start font-medium">מחיר ליחידה</th>
            <th className="p-3 text-start font-medium">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-line align-top">
              <td className="p-3">
                <ItemDescription item={item} />
              </td>
              <td className="p-3">{item.qty}</td>
              <td className="whitespace-nowrap p-3">{formatIls(item.unitPriceIls)}</td>
              <td className="whitespace-nowrap p-3">{formatIls(item.qty * item.unitPriceIls)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-semibold">
            <td className="p-3" colSpan={3}>
              סה״כ לפני משלוח
            </td>
            <td className="whitespace-nowrap p-3">{formatIls(subtotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ProgressNote({ progress }: { progress?: LineFacts }) {
  if (!progress || progress.quoted === 0) return null;
  const stage = lineStatus(progress);
  if (stage === "to_order") return null;
  return (
    <div className="mt-1 text-caption text-success">
      {LINE_LABELS[stage]}
      {progress.delivered > 0 && stage !== "delivered" && `, נמסרו ${progress.delivered} מתוך ${progress.quoted}`}
    </div>
  );
}

type QuoteView = {
  version: number;
  shippingIls: number;
  notes: string | null;
  lines: (QuoteLine & { changeReason: string | null })[];
};

/** Spec §8: a price change in the quote has to be visible to the team, so old values stay on screen. */
export function QuoteTable({
  quote,
  previous,
  items,
  progress,
}: {
  quote: QuoteView;
  previous?: QuoteView;
  items: OrderItem[];
  progress?: Map<string, LineFacts>;
}) {
  const linesByItem = new Map(quote.lines.map((line) => [line.itemId, line]));
  const changes = diffQuoteLines(previous?.lines ?? [], quote.lines);
  const totals = quoteTotals(quote.lines, quote.shippingIls);
  const shippingChanged = previous && previous.shippingIls !== quote.shippingIls;

  return (
    <div className="overflow-x-auto card-surface">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-muted">
          <tr>
            <th className="p-3 text-start font-medium">פריט</th>
            <th className="p-3 text-start font-medium">כמות</th>
            <th className="p-3 text-start font-medium">מחיר ליחידה</th>
            <th className="p-3 text-start font-medium">סה״כ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const line = linesByItem.get(item.id);
            if (!line) return null;
            const change = changes.get(line.itemId);
            const qtyBefore = change?.qtyBefore ?? (!previous && line.qty !== item.qty ? item.qty : undefined);
            const priceBefore =
              change?.priceBefore ?? (!previous && line.unitPriceIls !== item.unitPriceIls ? item.unitPriceIls : undefined);
            return (
              <tr key={line.itemId} className={`border-t border-line align-top ${line.qty === 0 ? "opacity-60" : ""}`}>
                <td className="p-3">
                  <ItemDescription item={item} />
                  {line.changeReason && <div className="mt-1 text-caption text-warning">סיבת השינוי: {line.changeReason}</div>}
                  <ProgressNote progress={progress?.get(line.itemId)} />
                </td>
                <td className="p-3">
                  {qtyBefore !== undefined && <s className="me-1 text-caption text-muted">{qtyBefore}</s>}
                  <span className={qtyBefore !== undefined ? "font-semibold text-warning" : ""}>{line.qty}</span>
                </td>
                <td className="whitespace-nowrap p-3">
                  {priceBefore !== undefined && <s className="me-1 text-caption text-muted">{formatIls(priceBefore)}</s>}
                  <span className={priceBefore !== undefined ? "font-semibold text-warning" : ""}>
                    {formatIls(line.unitPriceIls)}
                  </span>
                </td>
                <td className="whitespace-nowrap p-3">{formatIls(line.qty * line.unitPriceIls)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line">
            <td className="p-3" colSpan={3}>
              ביניים
            </td>
            <td className="whitespace-nowrap p-3">{formatIls(totals.subtotal)}</td>
          </tr>
          <tr className="border-t border-line">
            <td className="p-3" colSpan={3}>
              משלוח בישראל
            </td>
            <td className="whitespace-nowrap p-3">
              {shippingChanged && <s className="me-1 text-caption text-muted">{formatIls(previous.shippingIls)}</s>}
              <span className={shippingChanged ? "font-semibold text-warning" : ""}>{formatIls(quote.shippingIls)}</span>
            </td>
          </tr>
          <tr className="border-t border-line font-semibold">
            <td className="p-3" colSpan={3}>
              סה״כ לתשלום
            </td>
            <td className="whitespace-nowrap p-3">{formatIls(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
