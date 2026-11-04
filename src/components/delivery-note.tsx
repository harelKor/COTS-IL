import { ItemDescription } from "@/components/orders";
import type { getDeliveryForViewer } from "@/lib/logistics";

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

type Delivery = NonNullable<Awaited<ReturnType<typeof getDeliveryForViewer>>>;

/** The printable note. "Remaining" counts every note for the line, so a partial delivery shows its balance. */
export function DeliveryNote({ delivery, team, items }: Delivery) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 print:border-0 print:p-0">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">תעודת משלוח {delivery.number}</h1>
          <p className="text-sm text-muted">
            {team.name} · <span className="ltr">{`${team.program} ${team.number}`}</span>
          </p>
        </div>
        <div className="text-sm">
          <div>
            תאריך: <span className="ltr">{date.format(delivery.createdAt)}</span>
          </div>
          <div>{delivery.method === "ship" ? `משלוח לכתובת: ${delivery.address}` : "איסוף עצמי"}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-subtle text-muted">
            <tr>
              <th className="p-2 text-start font-medium">פריט</th>
              <th className="p-2 text-start font-medium">הזמנה</th>
              <th className="p-2 text-start font-medium">נמסר בתעודה</th>
              <th className="p-2 text-start font-medium">יתרה להזמנה</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const remaining = Math.max(item.quoted - item.deliveredTotal, 0);
              return (
                <tr key={item.allocationId} className="border-t border-line align-top">
                  <td className="p-2">
                    <ItemDescription item={item} />
                  </td>
                  <td className="p-2">{item.orderNumber}</td>
                  <td className="p-2 font-semibold">{item.qty}</td>
                  <td className={`p-2 ${remaining > 0 ? "text-warning" : ""}`}>{remaining}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {delivery.status === "delivered" ? (
        <p className="text-sm">
          נמסר ל{delivery.recipientName} בתאריך{" "}
          <span className="ltr">{delivery.deliveredAt && date.format(delivery.deliveredAt)}</span>
          {delivery.proofNote && ` · ${delivery.proofNote}`}
        </p>
      ) : (
        <p className="mt-6 hidden text-sm print:block">שם המקבל: _______________ חתימה: _______________ תאריך: __________</p>
      )}
    </section>
  );
}
