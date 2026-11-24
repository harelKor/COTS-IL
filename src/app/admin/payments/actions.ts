"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import { parsePayment, voidInput } from "@/domain/payments";
import { formatIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";

/**
 * P1: the admin records what a team paid, or voids a payment recorded by mistake. Payments
 * are append-only (a trigger refuses deletes and edits), and every write adds an audit_log
 * row under entity "payment" that outlives the order.
 */

const { auditLog, payments, teamOrders, teams } = schema;

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

  const result = await db.transaction(async (tx): Promise<ActionState & { teamId?: string }> => {
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
        createdBy: admin.id,
      })
      .returning();
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "payment",
      entityId: row.id,
      action: "record",
      after: { orderId: row.orderId, teamId, amountIls: p.amount, paidAt: p.paidAt, method: p.method, reference: p.reference, note: p.note },
    });
    return { ok: `נרשם תשלום של ${formatIls(p.amount, { agorot: true })}`, teamId };
  });
  if (result.teamId) refresh(p.orderId, result.teamId);
  return { error: result.error, ok: result.ok };
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
