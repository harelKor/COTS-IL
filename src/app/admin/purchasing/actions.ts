"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { selectBatch } from "@/domain/admin-orders";
import { consolidateDemand } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getDemandForUpdate } from "@/lib/purchasing";

const { auditLog, poAllocations, poLines, shipments, suppliers, supplierPos } = schema;

function refresh(poId?: string) {
  revalidatePath("/admin", "layout");
  if (poId) revalidatePath(`/admin/purchasing/${poId}`);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Puts what a supplier still needs onto its open draft, or onto a new one. With
 * `orderItemIds`, only those order lines go on it (a partial batch). Returns the draft, or null.
 */
async function addToDraft(tx: Tx, adminId: string, supplierId: string, orderItemIds?: ReadonlySet<string>) {
  await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId)).for("update");

  const all = consolidateDemand(await getDemandForUpdate(tx)).find((s) => s.supplierId === supplierId);
  if (!all) return null;
  const excluded = new Set(
    orderItemIds ? all.lines.flatMap((l) => l.allocations.map((a) => a.orderItemId)).filter((id) => !orderItemIds.has(id)) : [],
  );
  const lines = selectBatch(all.lines, excluded);
  if (lines.length === 0) return null;

  const [draft] = await tx
    .select({ id: supplierPos.id })
    .from(supplierPos)
    .where(and(eq(supplierPos.supplierId, supplierId), eq(supplierPos.status, "draft")));
  const id =
    draft?.id ?? (await tx.insert(supplierPos).values({ supplierId, createdBy: adminId }).returning({ id: supplierPos.id }))[0].id;

  for (const line of lines) {
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
    actorId: adminId,
    entity: "supplier_po",
    entityId: id,
    action: draft ? "extend" : "create",
    after: { lines: lines.map((l) => ({ sku: l.supplierSku, qty: l.qty })) },
  });
  return id;
}

/** Puts everything a supplier still needs onto its open draft, or onto a new one. */
export async function createPo(formData: FormData) {
  const admin = await requireAdmin();
  const supplierId = z.uuid().parse(formData.get("supplierId"));
  const poId = await db.transaction((tx) => addToDraft(tx, admin.id, supplierId));
  refresh(poId ?? undefined);
  if (poId) redirect(`/admin/purchasing/${poId}`);
}

const idsSchema = z.array(z.uuid()).min(1);

/** Adds only some order lines to the supplier's draft, from an order card. Stays on the page. */
export async function addLinesToDraft(_prev: PoFormState, formData: FormData): Promise<PoFormState> {
  const admin = await requireAdmin();
  const supplierId = z.uuid().safeParse(formData.get("supplierId"));
  const ids = idsSchema.safeParse(formData.getAll("orderItemId"));
  if (!supplierId.success || !ids.success) return { error: "הבקשה לא תקינה" };
  const poId = await db.transaction((tx) => addToDraft(tx, admin.id, supplierId.data, new Set(ids.data)));
  if (!poId) return { error: "אין מה להוסיף: הפריטים כבר בהזמנת ספק" };
  refresh(poId);
  return {};
}

const batchSchema = z.object({
  supplierId: z.uuid(),
  supplierOrderRef: z.string().trim().min(1).max(100),
  orderedAt: z.iso.date(),
});

/**
 * "סימון כהוזמן מהספק" for a vendor batch: puts the chosen order lines on the supplier's
 * draft and marks it ordered, in one go. Every team order it serves moves on together.
 */
export async function sendVendorBatch(_prev: PoFormState, formData: FormData): Promise<PoFormState> {
  const admin = await requireAdmin();
  const parsed = batchSchema.safeParse({
    supplierId: formData.get("supplierId"),
    supplierOrderRef: formData.get("supplierOrderRef"),
    orderedAt: formData.get("orderedAt"),
  });
  if (!parsed.success) return { error: "נא למלא מספר הזמנה אצל הספק ותאריך" };
  const ids = idsSchema.safeParse(formData.getAll("orderItemId"));
  if (!ids.success) return { error: "צריך לבחור לפחות פריט אחד" };
  const { supplierId, supplierOrderRef, orderedAt } = parsed.data;

  const result = await db.transaction(async (tx): Promise<PoFormState & { poId?: string }> => {
    const poId = await addToDraft(tx, admin.id, supplierId, new Set(ids.data));
    if (!poId) return { error: "אין מה לשלוח: הפריטים כבר הוזמנו" };
    const marked = await markOrdered(tx, admin.id, poId, { supplierOrderRef, orderedAt, notes: "" });
    return marked.error ? marked : { poId };
  });

  if (result.error) return { error: result.error };
  refresh(result.poId);
  return {};
}

/** Marks a supplier's open draft as ordered, from an order card: the draft's own costs stand. */
export async function sendDraft(_prev: PoFormState, formData: FormData): Promise<PoFormState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ poId: z.uuid(), supplierOrderRef: z.string().trim().min(1).max(100), orderedAt: z.iso.date() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "נא למלא מספר הזמנה אצל הספק ותאריך" };
  const { poId, ...rest } = parsed.data;
  const result = await db.transaction((tx) => markOrdered(tx, admin.id, poId, { ...rest, notes: "" }));
  refresh(poId);
  return result;
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

/** Records that the Israeli supplier placed this order on the supplier's site (AT-07). */
export async function recordOrdered(_prev: PoFormState, formData: FormData): Promise<PoFormState> {
  const admin = await requireAdmin();
  const parsed = recordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "נא למלא מספר הזמנה אצל הספק ותאריך" };
  const { poId, supplierOrderRef, orderedAt, notes } = parsed.data;

  const costs = new Map<string, FormDataEntryValue | null>();
  for (const [key, value] of formData) if (key.startsWith("cost:")) costs.set(key.slice(5), value);
  const result = await db.transaction((tx) => markOrdered(tx, admin.id, poId, { supplierOrderRef, orderedAt, notes }, costs));

  refresh(poId);
  return result;
}

/**
 * Marks a draft ordered. With `costs`, every line needs the price paid; without,
 * each line keeps the cost it was drafted at.
 */
async function markOrdered(
  tx: Tx,
  adminId: string,
  poId: string,
  { supplierOrderRef, orderedAt, notes }: { supplierOrderRef: string; orderedAt: string; notes: string },
  costs?: Map<string, FormDataEntryValue | null>,
): Promise<PoFormState> {
  const [po] = await tx.select().from(supplierPos).where(eq(supplierPos.id, poId)).for("update");
  if (!po) return { error: "ההזמנה לא נמצאה" };
  if (po.status !== "draft") return { error: "רק טיוטה יכולה להפוך להזמנה שבוצעה" };

  const lines = await tx.select().from(poLines).where(eq(poLines.poId, poId));
  if (lines.length === 0) return { error: "אין שורות בהזמנה" };

  if (costs) {
    const given = lines.map((line) => ({ id: line.id, cost: costs.get(line.id) ?? null }));
    if (given.some(({ cost }) => typeof cost !== "string" || cost === "" || !(Number(cost) >= 0))) {
      return { error: "נא למלא את המחיר ששולם לספק בכל שורה" };
    }
    for (const { id, cost } of given) {
      await tx.update(poLines).set({ unitCostUsd: Number(cost).toFixed(2) }).where(eq(poLines.id, id));
    }
  }

  await tx
    .update(supplierPos)
    .set({ status: "ordered", supplierOrderRef, orderedAt: new Date(orderedAt), notes: notes || null })
    .where(eq(supplierPos.id, poId));
  await tx.insert(auditLog).values({
    actorId: adminId,
    entity: "supplier_po",
    entityId: poId,
    action: "record_ordered",
    before: { status: po.status },
    after: { status: "ordered", supplierOrderRef, orderedAt },
  });
  return {};
}
