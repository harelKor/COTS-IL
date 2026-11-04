"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { consolidateDemand } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getDemandForUpdate } from "@/lib/purchasing";

const { auditLog, poAllocations, poLines, shipments, suppliers, supplierPos } = schema;

function refresh(poId?: string) {
  revalidatePath("/admin/purchasing");
  if (poId) revalidatePath(`/admin/purchasing/${poId}`);
}

/** Puts everything a supplier still needs onto its open draft, or onto a new one. */
export async function createPo(formData: FormData) {
  const admin = await requireAdmin();
  const supplierId = z.uuid().parse(formData.get("supplierId"));

  const poId = await db.transaction(async (tx) => {
    await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId)).for("update");

    const demand = consolidateDemand(await getDemandForUpdate(tx)).find((s) => s.supplierId === supplierId);
    if (!demand) return null;

    const [draft] = await tx
      .select({ id: supplierPos.id })
      .from(supplierPos)
      .where(and(eq(supplierPos.supplierId, supplierId), eq(supplierPos.status, "draft")));
    const id =
      draft?.id ??
      (await tx.insert(supplierPos).values({ supplierId, createdBy: admin.id }).returning({ id: supplierPos.id }))[0].id;

    for (const line of demand.lines) {
      const [saved] = await tx
        .insert(poLines)
        .values({
          poId: id,
          variantId: line.variantId,
          supplierVariantId: line.supplierVariantId,
          supplierSku: line.supplierSku,
          title: line.title,
          options: line.options,
          productUrl: line.productUrl,
          unitCostUsd: line.costUsd,
        })
        .onConflictDoUpdate({
          target: [poLines.poId, poLines.variantId],
          set: { unitCostUsd: sql`excluded.unit_cost_usd` },
        })
        .returning({ id: poLines.id });

      await tx
        .insert(poAllocations)
        .values(line.allocations.map((a) => ({ poLineId: saved.id, orderItemId: a.orderItemId, qty: a.qty })))
        .onConflictDoUpdate({
          target: [poAllocations.poLineId, poAllocations.orderItemId],
          set: { qty: sql`${poAllocations.qty} + excluded.qty` },
        });
    }

    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "supplier_po",
      entityId: id,
      action: draft ? "extend" : "create",
      after: { lines: demand.lines.map((l) => ({ sku: l.supplierSku, qty: l.qty })) },
    });
    return id;
  });

  refresh(poId ?? undefined);
  if (poId) redirect(`/admin/purchasing/${poId}`);
}

/** Takes a line off a draft. Its units go back to the board, to be bought later. */
export async function removePoLine(formData: FormData) {
  const admin = await requireAdmin();
  const lineId = z.uuid().parse(formData.get("lineId"));

  const poId = await db.transaction(async (tx) => {
    const [line] = await tx
      .select({ poId: poLines.poId, sku: poLines.supplierSku, status: supplierPos.status })
      .from(poLines)
      .innerJoin(supplierPos, eq(supplierPos.id, poLines.poId))
      .where(eq(poLines.id, lineId))
      .for("update", { of: supplierPos });
    if (!line || line.status !== "draft") return null;

    await tx.delete(poLines).where(eq(poLines.id, lineId));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "supplier_po",
      entityId: line.poId,
      action: "remove_line",
      before: { sku: line.sku },
    });
    return line.poId;
  });

  refresh(poId ?? undefined);
}

export type PoFormState = { error?: string };

/**
 * Cancelling keeps the record and returns its units to the board. An order already
 * placed with the supplier has to say why, since the supplier still has it.
 */
export async function cancelPo(_prev: PoFormState, formData: FormData): Promise<PoFormState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ poId: z.uuid(), reason: z.string().trim().max(500).default("") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "הבקשה לא תקינה" };
  const { poId, reason } = parsed.data;

  const result = await db.transaction(async (tx): Promise<PoFormState> => {
    const [po] = await tx.select().from(supplierPos).where(eq(supplierPos.id, poId)).for("update");
    if (!po || po.status === "cancelled") return { error: "ההזמנה כבר בוטלה" };
    if (po.status === "ordered" && reason.length < 2) return { error: "הזמנה שכבר בוצעה דורשת סיבת ביטול" };
    const [shipment] = await tx.select({ id: shipments.id }).from(shipments).where(eq(shipments.poId, poId)).limit(1);
    if (shipment) return { error: "יש להזמנה משלוחים. קודם צריך למחוק אותם." };

    await tx.update(supplierPos).set({ status: "cancelled" }).where(eq(supplierPos.id, poId));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "supplier_po",
      entityId: poId,
      action: "cancel",
      before: { status: po.status },
      after: { status: "cancelled", reason: reason || undefined },
    });
    return {};
  });

  refresh(poId);
  return result;
}

const recordSchema = z.object({
  poId: z.uuid(),
  supplierOrderRef: z.string().trim().min(1).max(100),
  orderedAt: z.iso.date(),
  notes: z.string().trim().max(2000).default(""),
});

/** Records that the mentor placed this order on the supplier's site (AT-07). */
export async function recordOrdered(_prev: PoFormState, formData: FormData): Promise<PoFormState> {
  const admin = await requireAdmin();
  const parsed = recordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "נא למלא מספר הזמנה אצל הספק ותאריך" };
  const { poId, supplierOrderRef, orderedAt, notes } = parsed.data;

  const result = await db.transaction(async (tx): Promise<PoFormState> => {
    const [po] = await tx.select().from(supplierPos).where(eq(supplierPos.id, poId)).for("update");
    if (!po) return { error: "ההזמנה לא נמצאה" };
    if (po.status !== "draft") return { error: "רק טיוטה יכולה להפוך להזמנה שבוצעה" };

    const lines = await tx.select().from(poLines).where(eq(poLines.poId, poId));
    if (lines.length === 0) return { error: "אין שורות בהזמנה" };

    const costs = lines.map((line) => ({ id: line.id, cost: formData.get(`cost:${line.id}`) }));
    if (costs.some(({ cost }) => typeof cost !== "string" || cost === "" || !(Number(cost) >= 0))) {
      return { error: "נא למלא את המחיר ששולם לספק בכל שורה" };
    }
    for (const { id, cost } of costs) {
      await tx.update(poLines).set({ unitCostUsd: Number(cost).toFixed(2) }).where(eq(poLines.id, id));
    }

    await tx
      .update(supplierPos)
      .set({ status: "ordered", supplierOrderRef, orderedAt: new Date(orderedAt), notes: notes || null })
      .where(eq(supplierPos.id, poId));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "supplier_po",
      entityId: poId,
      action: "record_ordered",
      before: { status: po.status },
      after: { status: "ordered", supplierOrderRef, orderedAt },
    });
    return {};
  });

  refresh(poId);
  return result;
}
