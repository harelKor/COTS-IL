"use server";

import { canAdvance } from "@/domain/order-status";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";

const { auditLog, deliveries, deliveryItems, stockAllocations, teamOrderItems, teamOrders } = schema;

function refresh(id?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/deliveries");
  revalidatePath("/admin/shortages");
  if (id) {
    revalidatePath(`/admin/deliveries/${id}`);
    revalidatePath(`/deliveries/${id}`);
  }
}

const createSchema = z.object({
  teamId: z.uuid(),
  method: z.enum(["pickup", "ship"]),
  address: z.string().trim().max(500).default(""),
});

/** Puts allocated units on a delivery note, which can be partial (AT-09). */
export async function createDelivery(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "הפרטים לא תקינים" };
  const { teamId, method, address } = parsed.data;
  if (method === "ship" && address.length < 5) return { error: "למשלוח צריך כתובת" };

  const result = await db.transaction(async (tx): Promise<ActionState & { id?: string }> => {
    // Locks the team's allocations, so the same units can't land on two notes.
    const allocations = await tx
      .select({
        id: stockAllocations.id,
        qty: stockAllocations.qty,
        delivered: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${deliveryItems} WHERE ${deliveryItems.allocationId} = ${stockAllocations.id})`,
      })
      .from(stockAllocations)
      .innerJoin(teamOrderItems, eq(teamOrderItems.id, stockAllocations.orderItemId))
      .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
      .where(eq(teamOrders.teamId, teamId))
      .for("update", { of: stockAllocations });

    const lines = allocations
      .map((a) => {
        const raw = formData.get(`qty:${a.id}`);
        return { ...a, take: raw === null || raw === "" ? 0 : Number(raw) };
      })
      .filter((a) => a.take !== 0);
    if (lines.length === 0) return { error: "צריך לבחור לפחות פריט אחד" };
    const refused = lines.map((a) => canAdvance("prepare_delivery", { reached: a.qty, done: a.delivered }, a.take)).find(Boolean);
    if (refused) return { error: refused };

    const [delivery] = await tx
      .insert(deliveries)
      .values({ teamId, method, address: method === "ship" ? address : null, createdBy: admin.id })
      .returning();
    await tx
      .insert(deliveryItems)
      .values(lines.map((a) => ({ deliveryId: delivery.id, allocationId: a.id, qty: a.take })));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "delivery",
      entityId: delivery.id,
      action: "create",
      after: { number: delivery.number, method, lines: lines.map((a) => ({ allocation: a.id, qty: a.take })) },
    });
    return { id: delivery.id };
  });

  if (result.error) return result;
  refresh(result.id);
  // From an order card the admin stays on the card.
  if (formData.get("stay")) return {};
  redirect(`/admin/deliveries/${result.id}`);
}

const confirmSchema = z.object({
  deliveryId: z.uuid(),
  recipientName: z.string().trim().min(2).max(100),
  deliveredAt: z.iso.date(),
  proofNote: z.string().trim().max(500).default(""),
});

/** Records who received the goods, which closes the delivery note. */
export async function confirmDelivery(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = confirmSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "נא למלא שם מקבל ותאריך" };
  const { deliveryId, recipientName, deliveredAt, proofNote } = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId)).for("update");
    if (!delivery) return { error: "התעודה לא נמצאה" };
    if (delivery.status !== "prepared") return { error: "התעודה כבר אושרה" };

    await tx
      .update(deliveries)
      .set({ status: "delivered", recipientName, deliveredAt: new Date(deliveredAt), proofNote: proofNote || null })
      .where(eq(deliveries.id, deliveryId));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "delivery",
      entityId: deliveryId,
      action: "confirm",
      before: { status: delivery.status },
      after: { status: "delivered", recipientName, deliveredAt },
    });
    return {};
  });

  refresh(deliveryId);
  return result;
}

/** Cancels a note that hasn't gone out. Its units go back to the delivery board. */
export async function cancelDelivery(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const deliveryId = z.uuid().safeParse(formData.get("deliveryId"));
  if (!deliveryId.success) return { error: "הבקשה לא תקינה" };

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const [delivery] = await tx.select().from(deliveries).where(eq(deliveries.id, deliveryId.data)).for("update");
    if (!delivery) return { error: "התעודה לא נמצאה" };
    if (delivery.status !== "prepared") return { error: "אי אפשר לבטל תעודה שנמסרה" };

    await tx.delete(deliveries).where(eq(deliveries.id, delivery.id));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "delivery",
      entityId: delivery.id,
      action: "cancel",
      before: { number: delivery.number, status: delivery.status },
    });
    return {};
  });

  if (result.error) return result;
  refresh(deliveryId.data);
  redirect("/admin/deliveries");
}
