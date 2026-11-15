"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { canRejectOrder, canSendQuote, validateQuoteLines } from "@/domain/orders";
import { validateRevision } from "@/domain/order-corrections";
import { requireAdmin } from "@/lib/auth";
import { emailEnabled, notifyLater, notifyQuoteReady } from "@/lib/notify";
import { orderSupplierLock } from "@/lib/purchasing";
import { currentQuote, insertQuoteVersion } from "@/lib/quote-versions";

const { auditLog, quotes, teamOrderItems, teamOrders } = schema;

export type QuoteFormState = {
  error?: string;
  lineErrors?: Record<string, string>;
  sent?: boolean;
  /** After a quote: whether the team is being emailed, so the editor says what was sent. */
  emailed?: boolean;
};

const headerSchema = z.object({
  orderId: z.uuid(),
  shippingIls: z.coerce.number().int().min(0),
  notes: z.string().trim().max(2000).default(""),
});

const toNumber = (value: FormDataEntryValue | null) => (value === null || value === "" ? NaN : Number(value));

/**
 * Sends a new quote version. Earlier versions stay on record, and the team has to answer this one.
 * Once lines are on supplier orders (M2) the quantities stay as they were and only prices and
 * shipping change: the new version still goes to the team for approval.
 */
export async function sendQuote(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const admin = await requireAdmin();
  const header = headerSchema.safeParse(Object.fromEntries(formData));
  if (!header.success) return { error: "נא למלא עלות משלוח בשקלים שלמים (0 אם אין משלוח)" };
  const { orderId, shippingIls, notes } = header.data;

  const result = await db.transaction(async (tx): Promise<QuoteFormState> => {
    const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, orderId)).for("update");
    if (!order) return { error: "ההזמנה לא נמצאה" };
    if (!canSendQuote(order.status)) return { error: "ההזמנה בוטלה" };
    const lock = await orderSupplierLock(tx, orderId);

    const items = await tx.select().from(teamOrderItems).where(eq(teamOrderItems.orderId, orderId));
    const lines = items.map((item) => ({
      itemId: item.id,
      qty: toNumber(formData.get(`qty:${item.id}`)),
      unitPriceIls: toNumber(formData.get(`price:${item.id}`)),
      changeReason: String(formData.get(`reason:${item.id}`) ?? "").trim().slice(0, 500),
    }));

    const previous = lock ? await currentQuote(tx, orderId) : null;
    if (lock && !previous) return { error: "לא נמצאה גרסה קודמת של ההצעה" };
    const lineErrors = { ...validateQuoteLines(items, lines), ...(previous ? validateRevision(previous.lines, lines) : {}) };
    if (Object.keys(lineErrors).length > 0) return { error: "יש שורות שצריך לתקן", lineErrors };
    if (lines.every((l) => l.qty === 0)) return { error: "אי אפשר לשלוח הצעה בלי פריטים. אפשר לדחות את ההזמנה." };

    await insertQuoteVersion(tx, {
      orderId,
      adminId: admin.id,
      orderStatus: order.status,
      shippingIls,
      notes: notes || null,
      lines,
      revision: !!lock,
    });
    return { sent: true };
  });

  if (result.sent) {
    const emailed = emailEnabled();
    if (emailed) notifyLater(() => notifyQuoteReady(orderId));
    result.emailed = emailed;
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/admin", "layout");
  }
  return result;
}

const rejectSchema = z.object({
  orderId: z.uuid(),
  reason: z.string().trim().min(2).max(1000),
});

export async function rejectOrder(_prev: QuoteFormState, formData: FormData): Promise<QuoteFormState> {
  const admin = await requireAdmin();
  const parsed = rejectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "נא לכתוב סיבת דחייה" };
  const { orderId, reason } = parsed.data;

  const result = await db.transaction(async (tx): Promise<QuoteFormState> => {
    const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, orderId)).for("update");
    if (!order) return { error: "ההזמנה לא נמצאה" };
    if (!canRejectOrder(order.status)) return { error: "אי אפשר לדחות הזמנה במצב הזה" };
    if (await orderSupplierLock(tx, orderId)) return { error: "יש בהזמנה שורות בהזמנת ספק, ולכן אי אפשר לדחות אותה. אפשר לבטל אותה." };

    await tx.update(teamOrders).set({ status: "rejected", rejectionReason: reason }).where(eq(teamOrders.id, orderId));
    await tx
      .update(quotes)
      .set({ status: "superseded" })
      .where(and(eq(quotes.orderId, orderId), eq(quotes.status, "sent")));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team_order",
      entityId: orderId,
      action: "reject",
      before: { status: order.status },
      after: { status: "rejected", reason },
    });
    return { sent: true };
  });

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin", "layout");
  return result;
}
