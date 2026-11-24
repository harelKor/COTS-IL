"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import { parseCheque } from "@/domain/morning";
import { parseMorningNo } from "@/domain/morning-numbers";
import { parsePayment, voidInput } from "@/domain/payments";
import { formatIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { issueDocument, issueResultText, morningStepOn, prepareReceipt } from "@/lib/morning-documents";

/**
 * P1: the admin records what a team paid, or voids a payment recorded by mistake. Payments
 * are append-only (a trigger refuses deletes and edits), and every write adds an audit_log
 * row under entity "payment" that outlives the order.
 */

const { auditLog, payments, quotes, teamOrders, teams } = schema;

function refresh(orderId: string | null, teamId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/balances");
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath("/orders");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

/** "רישום תשלום": on an order (the team is the order's), or on account for a team. */
export async function recordPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parsePayment(Object.fromEntries(formData));
  if (!parsed.ok) return { error: parsed.error };
  const p = parsed.value;
  // P3: "הפקת חשבונית מס/קבלה בחשבונית ירוקה", ticked by default while Morning is on. A number
  // typed by hand means it was issued there already.
  const issue = formData.get("issueDocument") === "on" && !p.morningDocNo && (await morningStepOn("invoice_receipt"));
  const cheque = parseCheque({ bankName: formData.get("bankName"), bankBranch: formData.get("bankBranch"), bankAccount: formData.get("bankAccount") });

  const result = await db.transaction(async (tx): Promise<ActionState & { teamId?: string; documentId?: string; documentError?: string }> => {
    let teamId = p.teamId;
    if (p.orderId) {
      // The order's row lock keeps a delete from racing the payment.
      const [order] = await tx.select({ id: teamOrders.id, teamId: teamOrders.teamId }).from(teamOrders).where(eq(teamOrders.id, p.orderId)).for("update");
      if (!order) return { error: "ההזמנה לא נמצאה" };
      teamId = order.teamId;
    } else {
      const [team] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
      if (!team) return { error: "הקבוצה לא נמצאה" };
    }
    const [row] = await tx
      .insert(payments)
      .values({
        orderId: p.orderId,
        teamId,
        amountIls: p.amount.toFixed(2),
        paidAt: p.paidAt,
        method: p.method,
        reference: p.reference,
        note: p.note,
        morningDocNo: p.morningDocNo,
        createdBy: admin.id,
      })
      .returning();
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "payment",
      entityId: row.id,
      action: "record",
      after: { orderId: row.orderId, teamId, amountIls: p.amount, paidAt: p.paidAt, method: p.method, reference: p.reference, note: p.note, morningDocNo: p.morningDocNo },
    });
    let documentId: string | undefined;
    let documentError: string | undefined;
    if (issue) {
      const prepared = await prepareReceipt(tx, {
        paymentId: row.id,
        orderId: row.orderId,
        teamId,
        amount: p.amount,
        paidAt: p.paidAt,
        method: p.method,
        reference: p.reference,
        cheque,
        actorId: admin.id,
      });
      if (prepared.ok) documentId = prepared.id;
      else documentError = prepared.error;
    }
    return { ok: `נרשם תשלום של ${formatIls(p.amount, { agorot: true })}`, teamId, documentId, documentError };
  });
  if (!result.teamId) return { error: result.error };
  // The payment is recorded either way; the document is issued after the commit, and the toast says how it went.
  let ok = result.ok;
  if (result.documentId) ok = `${ok}. ${issueResultText(await issueDocument(result.documentId))}`;
  else if (result.documentError) ok = `${ok}. בלי חשבונית: ${result.documentError}`;
  refresh(p.orderId, result.teamId);
  return { ok };
}

/** Voids a payment with a reason. It stays on record, marked, and stops counting. */
export async function voidPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = voidInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.path[0] === "reason" ? "צריך לכתוב למה מבטלים את התשלום" : "התשלום לא נמצא" };
  const { paymentId, reason } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(payments)
      .set({ voidedAt: new Date(), voidedBy: admin.id, voidReason: reason })
      .where(and(eq(payments.id, paymentId), isNull(payments.voidedAt)))
      .returning();
    if (!row) return null;
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "payment",
      entityId: row.id,
      action: "void",
      before: { orderId: row.orderId, teamId: row.teamId, amountIls: Number(row.amountIls), paidAt: row.paidAt, method: row.method, reference: row.reference },
      after: { orderId: row.orderId, reason },
    });
    return row;
  });
  if (!result) return { error: "התשלום כבר בוטל או לא נמצא" };
  refresh(result.orderId, result.teamId);
  return { ok: "התשלום בוטל" };
}

/**
 * The חשבונית מס/קבלה number typed from Morning, set or corrected later: the one thing on a
 * payment that may change (the DB trigger allows it).
 */
export async function setPaymentDocNo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const paymentId = z.uuid().safeParse(formData.get("paymentId"));
  if (!paymentId.success) return { error: "התשלום לא נמצא" };
  const docNo = parseMorningNo(formData.get("morningDocNo"));
  if (!docNo.ok) return { error: docNo.error };

  const row = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(payments).where(eq(payments.id, paymentId.data)).for("update");
    if (!before) return null;
    if (before.morningDocNo === docNo.value) return before;
    const [after] = await tx.update(payments).set({ morningDocNo: docNo.value }).where(eq(payments.id, before.id)).returning();
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "payment",
      entityId: before.id,
      action: "morning_doc_no",
      before: { orderId: before.orderId, morningDocNo: before.morningDocNo },
      after: { orderId: before.orderId, morningDocNo: docNo.value },
    });
    return after;
  });
  if (!row) return { error: "התשלום לא נמצא" };
  refresh(row.orderId, row.teamId);
  return { ok: docNo.value ? "מספר החשבונית נשמר" : "מספר החשבונית נמחק" };
}

/** The order's הצעת מחיר and חשבון עסקה numbers from Morning, on one quote version. */
export async function setQuoteMorningNumbers(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const quoteId = z.uuid().safeParse(formData.get("quoteId"));
  if (!quoteId.success) return { error: "ההצעה לא נמצאה" };
  const quoteNo = parseMorningNo(formData.get("morningQuoteNo"));
  if (!quoteNo.ok) return { error: quoteNo.error };
  const dealNo = parseMorningNo(formData.get("morningDealNo"));
  if (!dealNo.ok) return { error: dealNo.error };

  const row = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(quotes).where(eq(quotes.id, quoteId.data)).for("update");
    if (!before) return null;
    if (before.morningQuoteNo === quoteNo.value && before.morningDealNo === dealNo.value) return before;
    const [after] = await tx.update(quotes).set({ morningQuoteNo: quoteNo.value, morningDealNo: dealNo.value }).where(eq(quotes.id, before.id)).returning();
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "quote",
      entityId: before.id,
      action: "morning_numbers",
      before: { morningQuoteNo: before.morningQuoteNo, morningDealNo: before.morningDealNo },
      after: { morningQuoteNo: quoteNo.value, morningDealNo: dealNo.value },
    });
    return after;
  });
  if (!row) return { error: "ההצעה לא נמצאה" };
  const [order] = await db.select({ teamId: teamOrders.teamId }).from(teamOrders).where(eq(teamOrders.id, row.orderId));
  refresh(row.orderId, order?.teamId ?? "");
  return { ok: "המספרים נשמרו" };
}
