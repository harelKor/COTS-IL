import { eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/action-form";
import { Alert, Button } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { formatDay } from "@/domain/display";
import { business } from "@/lib/business";
import { ItemDescription, QuoteTable, formatDateTime } from "@/components/orders";
import { isFinished, LINE_LABELS, lineStatus, type OrderStatusKey } from "@/domain/order-status";
import { canRejectOrder } from "@/domain/orders";
import { priceIls } from "@/domain/pricing";
import { usdIlsRate } from "@/lib/fx";
import { requireAdmin } from "@/lib/auth";
import { getOrderDates, getOrderLogistics } from "@/lib/admin-orders";
import { getOrderLines } from "@/lib/order-status";
import { getOrderDeliveries } from "@/lib/logistics";
import { getOrderForViewer } from "@/lib/orders";
import { orderSupplierLock } from "@/lib/purchasing";
import { getApproveLinks } from "@/lib/quote-links";
import { reviewTeam } from "./actions";
import { confirmDelivery, createDelivery } from "./deliveries/actions";
import { ApproveLinks } from "./orders/[id]/approve-links";
import { OrderMenu, QuoteEditor, type EditorLine } from "./orders/[id]/quote-editor";
import { addLinesToDraft, sendDraft, sendVendorBatch } from "./purchasing/actions";
import { LINE_STYLE } from "./status-style";

type Detail = NonNullable<Awaited<ReturnType<typeof getOrderForViewer>>>;

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

const fieldClass = "h-11 min-w-0 rounded-full border border-line bg-surface px-4 text-base";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function OrderBadge({ id, number, label }: { id: string; number: number; label: string }) {
  return (
    <Link href={`/admin?open=${id}`} className="inline-flex min-h-8 items-center rounded-full bg-brand-soft px-3 text-xs font-medium text-brand-strong">
      <Ltr>{`${label} #${number}`}</Ltr>
    </Link>
  );
}

async function editorLines(detail: Detail): Promise<EditorLine[]> {
  const latest = detail.quotes[0];
  const latestLines = new Map(latest?.lines.map((line) => [line.itemId, line]));
  const live = detail.items.length
    ? await db
        .select({
          id: schema.variants.id,
          priceUsd: schema.variants.priceUsd,
          available: schema.variants.available,
          checkedAt: schema.variants.checkedAt,
          image: sql<string | null>`${schema.products.images}[1]`,
        })
        .from(schema.variants)
        .innerJoin(schema.products, eq(schema.products.id, schema.variants.productId))
        .where(inArray(schema.variants.id, detail.items.map((i) => i.variantId)))
    : [];
  const liveById = new Map(live.map((v) => [v.id, v]));
  const rate = await usdIlsRate();
  return detail.items.map((item) => {
    const line = latestLines.get(item.id);
    const variant = liveById.get(item.variantId);
    return {
      id: item.id,
      title: item.title,
      supplierName: item.supplierName,
      supplierSku: item.supplierSku,
      options: item.options,
      productUrl: item.productUrl,
      requestedQty: item.qty,
      requestedPrice: item.unitPriceIls,
      qty: line?.qty ?? item.qty,
      unitPriceIls: line?.unitPriceIls ?? item.unitPriceIls,
      changeReason: line?.changeReason ?? "",
      image: variant?.image ?? null,
      livePriceIls: priceIls(variant?.priceUsd, rate),
      liveAvailable: variant?.available ?? null,
      checkedAt: variant?.checkedAt.toISOString() ?? null,
    };
  });
}

function Contact({ detail }: { detail: Detail }) {
  const { order, team } = detail;
  return (
    <div className="grid gap-1 rounded-[14px] bg-subtle p-3 text-sm">
      <div>
        <span className="text-muted">מסירה: </span>
        {order.deliveryMethod === "ship" ? `משלוח לכתובת: ${order.address}` : "איסוף עצמי"}
      </div>
      <div>
        <span className="text-muted">איש קשר: </span>
        {order.contactName}, <Ltr>{order.contactPhone}</Ltr>
      </div>
      {order.notes && (
        <div className="whitespace-pre-wrap">
          <span className="text-muted">הערות הקבוצה: </span>
          {order.notes}
        </div>
      )}
      {team.status === "pending" && (
        <form action={reviewTeam} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="decision" value="active" />
          <span className="text-warning">הקבוצה חדשה ועדיין לא אושרה.</span>
          <Button>אישור הקבוצה</Button>
        </form>
      )}
    </div>
  );
}

async function Editor({ detail }: { detail: Detail }) {
  const latest = detail.quotes[0];
  return (
    <QuoteEditor
      key={latest?.id ?? "new"}
      orderId={detail.order.id}
      lines={await editorLines(detail)}
      shippingIls={latest?.shippingIls ?? (detail.order.deliveryMethod === "pickup" ? 0 : null)}
      notes={latest?.notes ?? ""}
      version={(latest?.version ?? 0) + 1}
      paymentTerms={business.paymentTerms}
    />
  );
}

function LockedQuote({ detail, orderId, ordered }: { detail: Detail; orderId: string; ordered: boolean }) {
  const latest = detail.quotes.find((q) => q.status !== "superseded") ?? detail.quotes[0];
  if (!latest) return null;
  return (
    <Section title={`הצעה גרסה ${latest.version}, נשלחה ${formatDateTime(latest.sentAt)}`}>
      <QuoteTable items={detail.items} quote={latest} />
      {ordered ? (
        <p className="text-sm text-muted">ההצעה נעולה: חלק מהפריטים כבר הוזמנו מהספק. שינוי נעשה בבקשה חדשה של הקבוצה.</p>
      ) : (
        <Link
          href={`/admin?open=${orderId}&edit=1`}
          scroll={false}
          className="flex min-h-11 w-fit items-center rounded-full bg-subtle px-4 text-sm font-medium hover:bg-subtle-hover"
        >
          לשנות פרטים ושליחה לאישור מחדש
        </Link>
      )}
    </Section>
  );
}

async function Links({ orderId }: { orderId: string }) {
  const links = await getApproveLinks(orderId);
  if (!links) return null;
  return (
    <Section title="קישורי אישור לקבוצה">
      {links.missingSecret ? (
        <Alert tone="info">כדי לשלוח קישורי אישור צריך להגדיר QUOTE_LINK_SECRET בסביבה.</Alert>
      ) : links.members.length === 0 ? (
        <p className="text-sm text-muted">אין כתובות בחשבון הקבוצה.</p>
      ) : (
        <ApproveLinks members={links.members} />
      )}
    </Section>
  );
}

/** The order's lines with their vendor orders, shipments and receipts, and the action for the stage. */
async function Logistics({ detail, status }: { detail: Detail; status: OrderStatusKey }) {
  const orderId = detail.order.id;
  const [lines, logistics, deliveries] = await Promise.all([
    getOrderLines([orderId]),
    getOrderLogistics(orderId),
    getOrderDeliveries(orderId),
  ]);
  const items = new Map(detail.items.map((i) => [i.id, i]));
  const supplierOf = new Map(
    (detail.items.length
      ? await db
          .select({ id: schema.variants.id, supplierId: schema.variants.supplierId })
          .from(schema.variants)
          .where(inArray(schema.variants.id, detail.items.map((i) => i.variantId)))
      : []
    ).map((v) => [v.id, v.supplierId]),
  );

  // Per vendor: lines not on any vendor order yet, and the draft that may hold the rest.
  const vendors = new Map<string, { name: string; waiting: string[]; draft?: (typeof logistics.pos)[number] }>();
  for (const l of lines) {
    const item = items.get(l.orderItemId)!;
    const supplierId = supplierOf.get(item.variantId)!;
    const v = vendors.get(supplierId) ?? { name: l.supplierName, waiting: [] };
    if (l.quoted > l.onBatch) v.waiting.push(l.orderItemId);
    v.draft ??= logistics.pos.find((p) => p.supplierId === supplierId && p.status === "draft");
    vendors.set(supplierId, v);
  }

  return (
    <div className="flex flex-col gap-5">
      <Section title="פריטים">
        <ul className="flex flex-col">
          {lines.map((l) => {
            const item = items.get(l.orderItemId)!;
            const stage = lineStatus(l);
            const onPos = logistics.lines.filter((x) => x.orderItemId === l.orderItemId);
            return (
              <li key={l.orderItemId} className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <ItemDescription item={item} />
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${LINE_STYLE[stage]}`}>{LINE_LABELS[stage]}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>כמות {l.quoted}</span>
                  {onPos.length === 0 && <span>עדיין לא בהזמנת ספק</span>}
                  {onPos.map((p) => (
                    <span key={p.poLineId}>
                      <Link href={`/admin/purchasing/${p.poId}`} className="text-brand hover:underline">
                        הזמנת ספק <Ltr>#{p.poNumber}</Ltr>
                      </Link>
                      {p.poStatus === "draft" ? " (טיוטה)" : ""}
                      {p.received > 0 && `, התקבלו ${p.received}`}
                      {p.damaged > 0 && `, פגומים ${p.damaged}`}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {status === "to_order" &&
        [...vendors].map(([supplierId, v]) => {
          const others = v.draft?.others ?? [];
          if (v.waiting.length === 0 && !v.draft) return null;
          return (
            <Section key={supplierId} title={`הזמנה מ-${v.name}`}>
              {others.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">באותה הזמנת ספק גם:</span>
                  {others.map((o) => (
                    <OrderBadge key={o.orderId} id={o.orderId} number={o.orderNumber} label={`${o.teamProgram} ${o.teamNumber}`} />
                  ))}
                </div>
              )}
              <ActionForm action={v.waiting.length ? sendVendorBatch : sendDraft} className="flex flex-col gap-2">
                <input type="hidden" name="supplierId" value={supplierId} />
                {v.draft && <input type="hidden" name="poId" value={v.draft.id} />}
                {v.waiting.map((id) => (
                  <input key={id} type="hidden" name="orderItemId" value={id} />
                ))}
                <div className="flex flex-wrap gap-2">
                  <input name="supplierOrderRef" required placeholder="מספר הזמנה אצל הספק" aria-label="מספר הזמנה אצל הספק" className={`${fieldClass} flex-1`} />
                  <input name="orderedAt" type="date" lang="he-IL" required defaultValue={today()} aria-label="תאריך ההזמנה" className={fieldClass} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button>סימון כהוזמן מהספק</Button>
                  {others.length > 0 && <span className="text-sm text-muted">מעדכן גם {others.length} הזמנות נוספות</span>}
                  <Link href={`/admin/purchasing#v-${supplierId}`} className="text-sm text-brand hover:underline">
                    פתיחת סל אצל הספק
                  </Link>
                </div>
              </ActionForm>
              {v.waiting.length > 0 && (
                <ActionForm action={addLinesToDraft} className="flex">
                  <input type="hidden" name="supplierId" value={supplierId} />
                  {v.waiting.map((id) => (
                    <input key={id} type="hidden" name="orderItemId" value={id} />
                  ))}
                  <Button variant="ghost">הוספה להזמנת ספק</Button>
                </ActionForm>
              )}
            </Section>
          );
        })}

      {logistics.shipments.length > 0 && (
        <Section title="משלוחים מהספק">
          <ul className="flex flex-col gap-2 text-sm">
            {logistics.shipments.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  משלוח <Ltr>#{s.number}</Ltr>
                  {s.carrier && <>, <Ltr>{s.carrier}</Ltr></>}
                  {s.tracking && <>, מעקב <Ltr>{s.tracking}</Ltr></>}
                  {s.received ? ", נקלט" : ", בדרך"}
                </span>
                <Link href={`/admin/logistics/${s.id}`} className="flex min-h-11 items-center rounded-full bg-subtle px-4 text-sm font-medium hover:bg-subtle-hover">
                  {s.received ? "פרטי הקליטה" : "קליטה במחסן"}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {status === "ordered" && logistics.shipments.length === 0 && (
        <p className="text-sm text-muted">
          עוד אין משלוח מהספק. מוסיפים משלוח בעמוד{" "}
          {logistics.pos[0] && (
            <Link href={`/admin/purchasing/${logistics.pos[0].id}`} className="text-brand hover:underline">
              הזמנת הספק
            </Link>
          )}
          .
        </p>
      )}

      {logistics.ready.length > 0 && (
        <Section title="הפקת תעודת משלוח">
          <ActionForm action={createDelivery} className="flex flex-col gap-2">
            <input type="hidden" name="stay" value="1" />
            <input type="hidden" name="teamId" value={detail.team.id} />
            <input type="hidden" name="method" value={detail.order.deliveryMethod} />
            <input type="hidden" name="address" value={detail.order.address ?? ""} />
            <ul className="flex flex-col text-sm">
              {logistics.ready.map((r) => {
                const item = items.get(r.orderItemId)!;
                const left = r.qty - r.onNotes;
                return (
                  <li key={r.allocationId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
                    <ItemDescription item={item} />
                    <label className="flex items-center gap-2 text-xs">
                      למסירה (עד {left})
                      <input name={`qty:${r.allocationId}`} type="number" min={0} max={left} defaultValue={left} className="h-11 w-20 rounded-full border border-line bg-surface px-3 text-base" />
                    </label>
                  </li>
                );
              })}
            </ul>
            <Button>הפקת תעודת משלוח</Button>
          </ActionForm>
        </Section>
      )}

      {deliveries.length > 0 && (
        <Section title="תעודות משלוח">
          <ul className="flex flex-col gap-3 text-sm">
            {deliveries.map((d) => (
              <li key={d.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    תעודה <Ltr>#{d.number}</Ltr>, {d.status === "delivered" ? `נמסרה${d.deliveredAt ? ` ${formatDay(d.deliveredAt)}` : ""}` : "מוכנה, עוד לא נמסרה"}
                  </span>
                  <Link href={`/admin/deliveries/${d.id}`} className="flex min-h-11 items-center rounded-full bg-subtle px-4 text-sm font-medium hover:bg-subtle-hover">
                    תעודה והדפסה
                  </Link>
                </div>
                {d.status === "prepared" && (
                  <ActionForm action={confirmDelivery} className="flex flex-wrap gap-2">
                    <input type="hidden" name="deliveryId" value={d.id} />
                    <input name="recipientName" required minLength={2} defaultValue={detail.order.contactName} aria-label="שם המקבל" className={`${fieldClass} flex-1`} />
                    <input name="deliveredAt" type="date" lang="he-IL" required defaultValue={today()} aria-label="תאריך המסירה" className={fieldClass} />
                    <Button>סימון כנמסר</Button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

async function Summary({ detail }: { detail: Detail }) {
  const dates = await getOrderDates(detail.order.id);
  const rows: [string, Date | null][] = [
    ["בקשה נשלחה", detail.order.submittedAt],
    ["הצעה נשלחה", dates.quoteSent],
    ["הקבוצה אישרה", dates.approved],
    ["הוזמן מהספק", dates.ordered],
    ["הגיע למחסן", dates.received],
    ["נמסר", dates.delivered],
  ];
  return (
    <Section title="סיכום">
      {detail.order.status === "rejected" && <Alert tone="info">ההזמנה נדחתה{detail.order.rejectionReason ? `: ${detail.order.rejectionReason}` : "."}</Alert>}
      {detail.order.status === "cancelled" && <Alert tone="info">ההזמנה בוטלה.</Alert>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {rows
          .filter(([, d]) => d)
          .map(([label, d]) => (
            <div key={label}>
              <dt className="text-muted">{label}</dt>
              <dd>
                <Ltr>{formatDateTime(d!)}</Ltr>
              </dd>
            </div>
          ))}
      </dl>
    </Section>
  );
}

/** What an open card shows: exactly what its stage needs, so the admin never leaves the page. */
export async function OrderPanel({ orderId, status, edit }: { orderId: string; status: OrderStatusKey; edit: boolean }) {
  const admin = await requireAdmin();
  const detail = await getOrderForViewer(orderId, admin);
  if (!detail) return <Alert>ההזמנה לא נמצאה.</Alert>;
  const finished = detail.order.status === "rejected" || detail.order.status === "cancelled";
  // Once a line is ordered from a supplier the quote can't change (S13), whatever the URL says.
  const ordered = (await orderSupplierLock(db, orderId)) === "ordered";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Contact detail={detail} />
        </div>
        {canRejectOrder(detail.order.status) && !isFinished(status) && <OrderMenu orderId={orderId} />}
      </div>
      {status === "awaiting_quote" || (edit && !finished && !ordered) ? (
        <Editor detail={detail} />
      ) : (
        !finished && <LockedQuote detail={detail} orderId={orderId} ordered={ordered} />
      )}
      {status === "quote_sent" && <Links orderId={orderId} />}
      {detail.order.status === "approved" && <Logistics detail={detail} status={status} />}
      {isFinished(status) && <Summary detail={detail} />}
      <Link href={`/orders/${orderId}`} className="text-sm text-brand hover:underline">
        תצוגת הקבוצה והדפסה
      </Link>
    </div>
  );
}
