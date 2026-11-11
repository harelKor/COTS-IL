import { eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/action-form";
import { Alert, Button, Field, Input } from "@/components/form";
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
import { getPo } from "@/lib/purchasing";
import { getOrderLines } from "@/lib/order-status";
import { getOrderDeliveries, getPoShipping } from "@/lib/logistics";
import { getChangeRequest, getOrderForViewer } from "@/lib/orders";
import { orderSupplierLock } from "@/lib/purchasing";
import { getApproveLinks } from "@/lib/quote-links";
import { reviewTeam } from "./actions";
import { confirmDelivery, createDelivery } from "./deliveries/actions";
import { ApproveLinks } from "./orders/[id]/approve-links";
import { OrderMenu, QuoteEditor, type EditorLine } from "./orders/[id]/quote-editor";
import { createShipment } from "./logistics/actions";
import { addLinesToDraft, sendDraft, sendVendorBatch } from "./purchasing/actions";
import { LINE_STYLE } from "./status-style";

type Detail = NonNullable<Awaited<ReturnType<typeof getOrderForViewer>>>;

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

const fieldClass = "h-11 min-w-0 rounded-full border border-line bg-surface px-4 text-base";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-surface flex flex-col gap-3 rounded-[18px] p-4" aria-label={title}>
      <h3 className="text-section font-semibold tracking-[-0.02em]">{title}</h3>
      {children}
    </section>
  );
}

function OrderBadge({ id, number, label }: { id: string; number: number; label: string }) {
  return (
    <Link href={`/admin?open=${id}`} className="inline-flex min-h-11 items-center rounded-full bg-brand-soft px-3 text-caption font-medium text-brand-strong">
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
    <div className="grid gap-1 text-sm">
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

/** One vendor order's shipments, and the form to open another for what hasn't shipped yet. */
async function PoShipments({ po }: { po: { id: string; number: number; supplierName: string; status: string; others: { orderId: string; orderNumber: number }[] } }) {
  const [result, shipping] = await Promise.all([getPo(po.id), getPoShipping(po.id)]);
  if (!result) return null;
  const unshipped = result.lines
    .map((line) => ({ ...line, open: line.qty - (shipping.shipped.get(line.id) ?? 0) }))
    .filter((line) => line.open > 0);
  const canOpen = po.status === "ordered" && unshipped.length > 0;
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          הזמנת ספק <Ltr>#{po.number}</Ltr>, <bdi>{po.supplierName}</bdi>
        </span>
        {po.others.length > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-muted">
            כולל גם הזמנות{" "}
            {po.others.map((o) => (
              <Ltr key={o.orderId}>#{o.orderNumber}</Ltr>
            ))}
          </span>
        )}
      </div>
      {shipping.shipments.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {shipping.shipments.map((s) => (
            <li key={s.id} className="flex flex-wrap gap-x-3">
              <Link href={`/admin/logistics/${s.id}`} className="text-brand hover:underline">
                משלוח <Ltr>#{s.number}</Ltr>
              </Link>
              <span className="text-muted">
                {[s.carrier, s.tracking].filter(Boolean).length > 0 ? <Ltr>{[s.carrier, s.tracking].filter(Boolean).join(" ")}</Ltr> : "בלי פרטי שילוח"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">עוד אין משלוח מהספק.</p>
      )}
      {canOpen ? (
        <ActionForm action={createShipment} className="flex flex-col gap-3">
          <input type="hidden" name="poId" value={po.id} />
          <input type="hidden" name="stay" value="1" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="חברת שילוח" name={`carrier-${po.id}`}>
              <Input name="carrier" id={`carrier-${po.id}`} dir="ltr" maxLength={100} />
            </Field>
            <Field label="מספר מעקב" name={`tracking-${po.id}`}>
              <Input name="tracking" id={`tracking-${po.id}`} dir="ltr" maxLength={200} />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">כמות במשלוח הזה (אפשר לפצל)</legend>
            {unshipped.map((line) => (
              <label key={line.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 text-start">
                  <Ltr>{line.supplierSku ?? line.title}</Ltr>
                </span>
                <input
                  name={`qty:${line.id}`}
                  type="number"
                  min={0}
                  max={line.open}
                  defaultValue={line.open}
                  aria-label={`כמות ${line.supplierSku ?? line.title}`}
                  className="h-11 w-24 shrink-0 rounded-xl border border-line bg-surface px-2 text-sm"
                />
              </label>
            ))}
          </fieldset>
          <Button className="self-start">פתיחת משלוח</Button>
        </ActionForm>
      ) : (
        po.status === "ordered" && <p className="text-sm text-muted">כל הכמויות כבר במשלוחים.</p>
      )}
    </div>
  );
}

/** The order's lines with their vendor orders, shipments and receipts, one outlined section per stage. */
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
  const orderedPos = logistics.pos.filter((p) => p.status === "ordered");

  return (
    <>
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
                  <span className={`rounded-full px-3 py-1 text-caption font-medium ${LINE_STYLE[stage]}`}>{LINE_LABELS[stage]}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
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
            <Section key={supplierId} title={`הזמנת ספק, ${v.name}`}>
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
                  <Button variant="secondary">הוספה להזמנת ספק</Button>
                </ActionForm>
              )}
            </Section>
          );
        })}

      {status !== "to_order" && orderedPos.length > 0 && (
        <Section title="הזמנת ספק">
          <ul className="flex flex-col gap-2 text-sm">
            {orderedPos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <bdi>{p.supplierName}</bdi>, <Ltr>#{p.number}</Ltr>
                  {p.supplierOrderRef && <>, מספר אצל הספק <Ltr>{p.supplierOrderRef}</Ltr></>}
                  {p.orderedAt && `, הוזמן ${formatDay(p.orderedAt)}`}
                </span>
                <Link href={`/admin/purchasing/${p.id}`} className="text-brand hover:underline">
                  פתיחת ההזמנה
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {orderedPos.length > 0 && (
        <Section title="משלוחים">
          {orderedPos.map((p) => (
            <PoShipments key={p.id} po={p} />
          ))}
        </Section>
      )}

      {logistics.shipments.length > 0 && (
        <Section title="קליטה במחסן">
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
                    <label className="flex items-center gap-2 text-caption">
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
        <Section title="מסירה">
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
    </>
  );
}

async function Summary({ detail }: { detail: Detail }) {
  const latest = detail.quotes[0];
  const [dates, changeRequest] = await Promise.all([getOrderDates(detail.order.id), latest?.status === "sent" ? getChangeRequest(latest.id) : null]);
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
      {changeRequest && (
        <Alert tone="info">
          הקבוצה ביקשה שינוי בגרסה {latest.version} (<Ltr>{formatDateTime(changeRequest.at)}</Ltr>): {changeRequest.reason}
        </Alert>
      )}
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
    <div className="flex flex-col gap-4">
      <Section title="פרטי ההזמנה">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Contact detail={detail} />
          </div>
          {canRejectOrder(detail.order.status) && !isFinished(status) && <OrderMenu orderId={orderId} />}
        </div>
      </Section>
      {status === "awaiting_quote" || (edit && !finished && !ordered) ? (
        <Section title="הצעה">
          <Editor detail={detail} />
        </Section>
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
