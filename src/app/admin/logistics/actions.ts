"use server";

import { canAdvance } from "@/domain/order-status";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import { fifoAllocate, rebalanceAllocations, validateAllocations, validateReceiptLine } from "@/domain/logistics";
import { requireAdmin } from "@/lib/auth";
import { notifyStagesLater } from "@/lib/notify";
import { getShares } from "@/lib/logistics";

const {
  auditLog,
  deliveryItems,
  importCosts,
  poLines,
  receiptLines,
  receipts,
  shipmentItems,
  shipments,
  stockAllocations,
  supplierPos,
} = schema;

const count = (value: FormDataEntryValue | null) => (value === null || value === "" ? 0 : Number(value));

function refresh(shipmentId?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/deliveries");
  revalidatePath("/admin/shortages");
  if (shipmentId) revalidatePath(`/admin/logistics/${shipmentId}`);
}

const shipmentSchema = z.object({
  poId: z.uuid(),
  carrier: z.string().trim().max(100).default(""),
  tracking: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(2000).default(""),
});

export async function createShipment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = shipmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "הפרטים לא תקינים" };
  const { poId, carrier, tracking, notes } = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionState & { id?: string }> => {
    const [po] = await tx.select().from(supplierPos).where(eq(supplierPos.id, poId)).for("update");
    if (po?.status !== "ordered") return { error: "אפשר לפתוח משלוח רק להזמנה שבוצעה" };

    const lines = await tx
      .select({
        id: poLines.id,
        // Spelled out: in a one-table select drizzle writes ${poLines.id} as a bare "id", which a
        // subquery reads as its own table's id (po_allocations and receipt_lines have one).
        ordered: sql<number>`(SELECT coalesce(sum(a.qty), 0)::int FROM po_allocations a WHERE a.po_line_id = po_lines.id)`,
        shipped: sql<number>`(SELECT coalesce(sum(si.qty), 0)::int FROM shipment_items si WHERE si.po_line_id = po_lines.id)`,
        damaged: sql<number>`(SELECT coalesce(sum(rl.qty_damaged), 0)::int FROM receipt_lines rl WHERE rl.po_line_id = po_lines.id)`,
      })
      .from(poLines)
      .where(eq(poLines.poId, poId));

    const items = lines
      .map((line) => ({ line, qty: count(formData.get(`qty:${line.id}`)) }))
      .filter(({ qty }) => qty !== 0);
    if (items.length === 0) return { error: "צריך לפחות שורה אחת עם כמות" };
    // Damaged units can be shipped again, so they don't count as done.
    const refused = items.map(({ line, qty }) => canAdvance("ship", { reached: line.ordered, done: line.shipped - line.damaged }, qty)).find(Boolean);
    if (refused) return { error: refused };

    const [shipment] = await tx
      .insert(shipments)
      .values({ poId, carrier: carrier || null, tracking: tracking || null, notes: notes || null, createdBy: admin.id })
      .returning();
    await tx
      .insert(shipmentItems)
      .values(items.map(({ line, qty }) => ({ shipmentId: shipment.id, poLineId: line.id, qty })));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "shipment",
      entityId: shipment.id,
      action: "create",
      after: { poNumber: po.number, carrier, tracking, items: items.map(({ line, qty }) => ({ line: line.id, qty })) },
    });
    return { id: shipment.id };
  });

  if (result.error) return result;
  refresh(result.id);
  revalidatePath(`/admin/purchasing/${poId}`);
  // From an order card the admin stays on the card.
  if (formData.get("stay")) return {};
  redirect(`/admin/logistics/${result.id}`);
}

const costSchema = z.object({
  shipmentId: z.uuid(),
  type: z.enum(["customs", "freight", "broker", "vat"]),
  amountIls: z.coerce.number().positive(),
  reference: z.string().trim().max(200).default(""),
  vatReclaimable: z.literal("on").optional(),
});

export async function addImportCost(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = costSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "נא למלא סוג וסכום גדול מאפס" };
  const { shipmentId, type, amountIls, reference, vatReclaimable } = parsed.data;

  await db.transaction(async (tx) => {
    const [cost] = await tx
      .insert(importCosts)
      .values({
        shipmentId,
        type,
        amountIls: amountIls.toFixed(2),
        vatReclaimable: vatReclaimable === "on",
        reference: reference || null,
        createdBy: admin.id,
      })
      .returning();
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "import_cost",
      entityId: cost.id,
      action: "create",
      after: { shipmentId, type, amountIls, vatReclaimable: cost.vatReclaimable },
    });
  });

  refresh(shipmentId);
  return {};
}

export async function removeImportCost(formData: FormData) {
  const admin = await requireAdmin();
  const idParsed = z.uuid().safeParse(formData.get("id"));
  if (!idParsed.success) return;
  const id = idParsed.data;

  const shipmentId = await db.transaction(async (tx) => {
    const [cost] = await tx.delete(importCosts).where(eq(importCosts.id, id)).returning();
    if (!cost) return null;
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "import_cost",
      entityId: id,
      action: "remove",
      before: { type: cost.type, amountIls: cost.amountIls, reference: cost.reference },
    });
    return cost.shipmentId;
  });

  refresh(shipmentId ?? undefined);
}

/** Records what arrived, even if partial, and hands the good units to teams, oldest order first (AT-08). */
export async function receiveShipment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const shipmentId = z.uuid().safeParse(formData.get("shipmentId"));
  if (!shipmentId.success) return { error: "הבקשה לא תקינה" };
  const id = shipmentId.data;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id));
    if (!shipment) return { error: "המשלוח לא נמצא" };
    // Everything that changes this order's stock takes this lock first.
    await tx.select({ id: supplierPos.id }).from(supplierPos).where(eq(supplierPos.id, shipment.poId)).for("update");

    const items = await tx.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, id));
    const already = await tx
      .select({ poLineId: receiptLines.poLineId, qty: sql<number>`sum(${receiptLines.qtyReceived})::int` })
      .from(receiptLines)
      .innerJoin(receipts, eq(receipts.id, receiptLines.receiptId))
      .where(eq(receipts.shipmentId, id))
      .groupBy(receiptLines.poLineId);
    const receivedBefore = new Map(already.map((r) => [r.poLineId, r.qty]));

    const lines = items.map((item) => ({
      poLineId: item.poLineId,
      open: item.qty - (receivedBefore.get(item.poLineId) ?? 0),
      received: count(formData.get(`received:${item.poLineId}`)),
      damaged: count(formData.get(`damaged:${item.poLineId}`)),
      location: String(formData.get(`location:${item.poLineId}`) ?? "").trim().slice(0, 100),
    }));

    for (const line of lines) {
      const error = validateReceiptLine(line);
      if (error) return { error };
    }
    const arrived = lines.filter((l) => l.received > 0);
    if (arrived.length === 0) return { error: "צריך לפחות שורה אחת שהתקבלה" };

    const shares = await getShares(arrived.map((l) => l.poLineId), tx);
    const [receipt] = await tx.insert(receipts).values({ shipmentId: id, notes: notes || null, receivedBy: admin.id }).returning();

    for (const line of arrived) {
      const [saved] = await tx
        .insert(receiptLines)
        .values({
          receiptId: receipt.id,
          poLineId: line.poLineId,
          qtyReceived: line.received,
          qtyDamaged: line.damaged,
          location: line.location || null,
        })
        .returning();
      const allocations = fifoAllocate(
        line.received - line.damaged,
        shares
          .filter((s) => s.poLineId === line.poLineId)
          .map((s) => ({ orderItemId: s.orderItemId, open: s.share - s.allocated })),
      );
      if (allocations.length > 0) {
        await tx.insert(stockAllocations).values(allocations.map((a) => ({ receiptLineId: saved.id, ...a })));
      }
    }

    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "receipt",
      entityId: receipt.id,
      action: "create",
      after: { shipmentId: id, lines: arrived },
    });
    return {};
  });

  if (!result.error) notifyStagesLater({ shipmentId: id });
  refresh(id);
  return result;
}

/** Undoes a receipt entered by mistake, as long as nothing from it has gone to a team. */
export async function reverseReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const receiptId = z.uuid().safeParse(formData.get("receiptId"));
  if (!receiptId.success) return { error: "הבקשה לא תקינה" };

  let shipmentId: string | undefined;
  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const [receipt] = await tx.select().from(receipts).where(eq(receipts.id, receiptId.data));
    if (!receipt) return { error: "הקליטה לא נמצאה" };
    shipmentId = receipt.shipmentId;

    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, receipt.shipmentId));
    await tx.select({ id: supplierPos.id }).from(supplierPos).where(eq(supplierPos.id, shipment.poId)).for("update");

    const lines = await tx.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id));
    const allocations = await tx
      .select()
      .from(stockAllocations)
      .where(
        inArray(
          stockAllocations.receiptLineId,
          lines.map((l) => l.id),
        ),
      );
    if (allocations.length > 0) {
      const [used] = await tx
        .select({ id: deliveryItems.allocationId })
        .from(deliveryItems)
        .where(
          inArray(
            deliveryItems.allocationId,
            allocations.map((a) => a.id),
          ),
        )
        .limit(1);
      if (used) return { error: "יש מקליטה זו פריטים בתעודת משלוח. קודם צריך לבטל את התעודה, או לתקן את הכמות בשורה עצמה." };
    }

    await tx.delete(receipts).where(eq(receipts.id, receipt.id));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "receipt",
      entityId: receipt.id,
      action: "reverse",
      before: { lines, allocations },
    });
    return {};
  });

  refresh(shipmentId);
  return result;
}

/** Moves a received line's good units between teams, within what each team is owed. */
export async function setAllocations(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const lineId = z.uuid().safeParse(formData.get("receiptLineId"));
  if (!lineId.success) return { error: "הבקשה לא תקינה" };

  let shipmentId: string | undefined;
  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const [line] = await tx
      .select({ line: receiptLines, shipmentId: receipts.shipmentId, poId: shipments.poId })
      .from(receiptLines)
      .innerJoin(receipts, eq(receipts.id, receiptLines.receiptId))
      .innerJoin(shipments, eq(shipments.id, receipts.shipmentId))
      .where(eq(receiptLines.id, lineId.data));
    if (!line) return { error: "השורה לא נמצאה" };
    shipmentId = line.shipmentId;
    await tx.select({ id: supplierPos.id }).from(supplierPos).where(eq(supplierPos.id, line.poId)).for("update");

    const shares = await getShares([line.line.poLineId], tx);
    const current = await tx
      .select({
        id: stockAllocations.id,
        orderItemId: stockAllocations.orderItemId,
        qty: stockAllocations.qty,
        delivered: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${deliveryItems} WHERE ${deliveryItems.allocationId} = ${stockAllocations.id})`,
      })
      .from(stockAllocations)
      .where(eq(stockAllocations.receiptLineId, line.line.id))
      .for("update", { of: stockAllocations });
    const byItem = new Map(current.map((c) => [c.orderItemId, c]));

    const rows = shares.map((share) => {
      const existing = byItem.get(share.orderItemId);
      return {
        orderItemId: share.orderItemId,
        existing,
        qty: count(formData.get(`qty:${share.orderItemId}`)),
        share: share.share,
        allocatedElsewhere: share.allocated - (existing?.qty ?? 0),
        delivered: existing?.delivered ?? 0,
      };
    });

    // Units kept by a cancelled order (already delivered to it) aren't among the shares, but they still take room.
    const kept = current.filter((c) => !shares.some((s) => s.orderItemId === c.orderItemId)).reduce((n, c) => n + c.qty, 0);
    const error = validateAllocations(line.line.qtyReceived - line.line.qtyDamaged - kept, rows);
    if (error) return { error };

    for (const row of rows) {
      if (row.existing && row.qty === 0) {
        await tx.delete(stockAllocations).where(eq(stockAllocations.id, row.existing.id));
      } else if (row.existing) {
        await tx.update(stockAllocations).set({ qty: row.qty }).where(eq(stockAllocations.id, row.existing.id));
      } else if (row.qty > 0) {
        await tx.insert(stockAllocations).values({ receiptLineId: line.line.id, orderItemId: row.orderItemId, qty: row.qty });
      }
    }

    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "receipt_line",
      entityId: line.line.id,
      action: "set_allocations",
      before: current.map((c) => ({ orderItemId: c.orderItemId, qty: c.qty })),
      after: rows.map((r) => ({ orderItemId: r.orderItemId, qty: r.qty })),
    });
    return {};
  });

  refresh(shipmentId);
  return result;
}

/** Removes a shipment entered by mistake, as long as nothing was received from it. */
export async function deleteShipment(formData: FormData) {
  const admin = await requireAdmin();
  const idParsed = z.uuid().safeParse(formData.get("shipmentId"));
  if (!idParsed.success) return;
  const id = idParsed.data;

  const removed = await db.transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, id));
    if (!shipment) return false;
    await tx.select({ id: supplierPos.id }).from(supplierPos).where(eq(supplierPos.id, shipment.poId)).for("update");
    const [receipt] = await tx.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.shipmentId, id))).limit(1);
    if (receipt) return false;

    await tx.delete(shipments).where(eq(shipments.id, id));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "shipment",
      entityId: id,
      action: "delete",
      before: { carrier: shipment.carrier, tracking: shipment.tracking },
    });
    return true;
  });

  refresh(id);
  if (removed) redirect("/admin/purchasing#sent");
}

const editSchema = z.object({
  receiptLineId: z.uuid(),
  received: z.coerce.number().int().min(0),
  damaged: z.coerce.number().int().min(0),
  location: z.string().trim().max(100).default(""),
});

/**
 * Corrects a received line in place (M2): how many arrived, how many of them are damaged, and
 * where they are. The teams' allocations follow: fewer good units come back from the newest
 * orders first, more go to the oldest that are still owed. Units on delivery notes stay put.
 * Zero removes the line (and the receipt, when it was its last line).
 */
export async function editReceiptLine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "כמות לא תקינה" };
  const { receiptLineId, received, damaged, location } = parsed.data;

  let shipmentId: string | undefined;
  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const [found] = await tx
      .select({ line: receiptLines, receiptId: receipts.id, shipmentId: receipts.shipmentId, poId: shipments.poId })
      .from(receiptLines)
      .innerJoin(receipts, eq(receipts.id, receiptLines.receiptId))
      .innerJoin(shipments, eq(shipments.id, receipts.shipmentId))
      .where(eq(receiptLines.id, receiptLineId));
    if (!found) return { error: "השורה לא נמצאה" };
    shipmentId = found.shipmentId;
    await tx.select({ id: supplierPos.id }).from(supplierPos).where(eq(supplierPos.id, found.poId)).for("update");
    const { line } = found;

    const [shipped] = await tx
      .select({ qty: shipmentItems.qty })
      .from(shipmentItems)
      .where(and(eq(shipmentItems.shipmentId, found.shipmentId), eq(shipmentItems.poLineId, line.poLineId)));
    const [others] = await tx
      .select({ qty: sql<number>`coalesce(sum(${receiptLines.qtyReceived}), 0)::int` })
      .from(receiptLines)
      .innerJoin(receipts, eq(receipts.id, receiptLines.receiptId))
      .where(and(eq(receipts.shipmentId, found.shipmentId), eq(receiptLines.poLineId, line.poLineId), sql`${receiptLines.id} <> ${line.id}`));
    const invalid = validateReceiptLine({ open: (shipped?.qty ?? 0) - (others?.qty ?? 0), received, damaged });
    if (invalid) return { error: invalid };

    const held = await tx
      .select({
        id: stockAllocations.id,
        orderItemId: stockAllocations.orderItemId,
        qty: stockAllocations.qty,
        delivered: sql<number>`(SELECT coalesce(sum(qty), 0)::int FROM ${deliveryItems} WHERE ${deliveryItems.allocationId} = ${stockAllocations.id})`,
      })
      .from(stockAllocations)
      .where(eq(stockAllocations.receiptLineId, line.id))
      .for("update", { of: stockAllocations });
    const shares = await getShares([line.poLineId], tx);
    // Units delivered on an order that was since deleted belong to no team, but they still take room.
    const kept = held.filter((h) => h.orderItemId === null).reduce((n, h) => n + h.qty, 0);
    const teamHeld = held.flatMap((h) => (h.orderItemId === null ? [] : [{ ...h, orderItemId: h.orderItemId }]));
    const next = rebalanceAllocations(
      received - damaged - kept,
      teamHeld,
      shares.map((s) => ({ orderItemId: s.orderItemId, open: s.share - s.allocated })),
    );
    if ("error" in next) return { error: next.error };

    const before = { qtyReceived: line.qtyReceived, qtyDamaged: line.qtyDamaged, location: line.location, allocations: held.map((h) => ({ orderItemId: h.orderItemId, qty: h.qty })) };
    if (received === 0) {
      await tx.delete(receiptLines).where(eq(receiptLines.id, line.id));
      const [left] = await tx.select({ id: receiptLines.id }).from(receiptLines).where(eq(receiptLines.receiptId, found.receiptId)).limit(1);
      if (!left) await tx.delete(receipts).where(eq(receipts.id, found.receiptId));
    } else {
      await tx.update(receiptLines).set({ qtyReceived: received, qtyDamaged: damaged, location: location || null }).where(eq(receiptLines.id, line.id));
      for (const row of next) {
        const existing = teamHeld.find((h) => h.orderItemId === row.orderItemId);
        if (existing && row.qty === 0) await tx.delete(stockAllocations).where(eq(stockAllocations.id, existing.id));
        else if (existing && row.qty !== existing.qty) await tx.update(stockAllocations).set({ qty: row.qty }).where(eq(stockAllocations.id, existing.id));
        else if (!existing && row.qty > 0) await tx.insert(stockAllocations).values({ receiptLineId: line.id, orderItemId: row.orderItemId, qty: row.qty });
      }
    }

    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "receipt_line",
      entityId: line.id,
      action: "edit",
      before,
      after: { qtyReceived: received, qtyDamaged: damaged, location: location || null, allocations: received === 0 ? [] : next },
    });
    return { ok: received === 0 ? "השורה הוסרה מהקליטה." : "הכמות עודכנה." };
  });

  // A refused correction changed nothing: no refresh, so the open form keeps its message.
  if (result.error) return result;
  if (shipmentId) notifyStagesLater({ shipmentId });
  refresh(shipmentId);
  return result;
}
