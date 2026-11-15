"use server";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionState } from "@/components/action-form";
import { teamDisplay } from "@/domain/display";
import {
  canAdminCancel,
  canEditLines,
  canReopen,
  cancelPlan,
  deleteBlocker,
  moveBlocker,
  reopenTarget,
  replaceBlocker,
  replacementNeedsApproval,
} from "@/domain/order-corrections";
import type { OrderStatus } from "@/domain/orders";
import { priceIls } from "@/domain/pricing";
import { requireAdmin } from "@/lib/auth";
import { emailEnabled, notifyLater, notifyQuoteReady } from "@/lib/notify";
import { getCancelLines, getOrderLinks } from "@/lib/order-corrections";
import { currentQuote, insertQuoteVersion, type Tx } from "@/lib/quote-versions";
import { priceContext } from "@/lib/settings";

const {
  auditLog,
  poAllocations,
  poLines,
  products,
  quotes,
  receiptLines,
  stockAllocations,
  supplierPos,
  suppliers,
  teamOrderItems,
  teamOrders,
  teams,
  variants,
} = schema;

function refresh(orderId: string) {
  revalidatePath("/admin", "layout");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
}

const reasonSchema = z.string().trim().min(2).max(1000);

/** Locks the order's row and the supplier orders its lines are on, so stock can't move under us. */
async function lockOrder(tx: Tx, orderId: string) {
  const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, orderId)).for("update");
  if (!order) return null;
  await tx.execute(sql`
    SELECT p.id FROM supplier_pos p WHERE p.id IN (
      SELECT l.po_id FROM po_lines l JOIN po_allocations a ON a.po_line_id = l.id
      JOIN team_order_items i ON i.id = a.order_item_id WHERE i.order_id = ${orderId}
    ) FOR UPDATE
  `);
  return order;
}

/** Takes order lines off draft supplier orders, and drops draft lines left with no units. Returns what was removed. */
async function releaseFromDrafts(tx: Tx, itemIds: string[]) {
  if (itemIds.length === 0) return { allocations: [], lines: [] };
  const draftLines = tx
    .select({ id: poLines.id })
    .from(poLines)
    .innerJoin(supplierPos, and(eq(supplierPos.id, poLines.poId), eq(supplierPos.status, "draft")));
  const allocations = await tx
    .delete(poAllocations)
    .where(and(inArray(poAllocations.orderItemId, itemIds), inArray(poAllocations.poLineId, draftLines)))
    .returning();
  const touched = [...new Set(allocations.map((a) => a.poLineId))];
  const lines = touched.length
    ? await tx
        .delete(poLines)
        .where(and(inArray(poLines.id, touched), sql`NOT EXISTS (SELECT 1 FROM po_allocations a WHERE a.po_line_id = po_lines.id)`))
        .returning()
    : [];
  return { allocations, lines };
}

export type CancelResult = ActionState & { warnings?: string[] };

/**
 * The admin cancels an order at any stage, with a reason the team sees (M2). Lines on draft
 * supplier orders are released; units already ordered, shipped or received stay on their
 * supplier order as surplus stock (kept, never deleted), and received units no longer go to
 * the team. Refused while units sit on an unconfirmed delivery note.
 */
export async function adminCancelOrder(_prev: CancelResult, formData: FormData): Promise<CancelResult> {
  const admin = await requireAdmin();
  const orderId = z.uuid().safeParse(formData.get("orderId"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!orderId.success) return { error: "ההזמנה לא נמצאה" };
  if (!reason.success) return { error: "נא לכתוב סיבת ביטול (הקבוצה תראה אותה)" };

  const result = await db.transaction(async (tx): Promise<CancelResult> => {
    const order = await lockOrder(tx, orderId.data);
    if (!order) return { error: "ההזמנה לא נמצאה" };
    if (!canAdminCancel(order.status)) return { error: "ההזמנה כבר בוטלה" };

    const plan = cancelPlan(await getCancelLines(tx, order.id));
    if (plan.blocked) return { error: plan.blocked };
    const items = await tx.select({ id: teamOrderItems.id }).from(teamOrderItems).where(eq(teamOrderItems.orderId, order.id));
    const itemIds = items.map((i) => i.id);

    const released = await releaseFromDrafts(tx, itemIds);

    // Received units no team gets now: the allocation shrinks to what was delivered (prepared notes block the cancel).
    const stock = itemIds.length
      ? await tx
          .select({
            id: stockAllocations.id,
            receiptLineId: stockAllocations.receiptLineId,
            orderItemId: stockAllocations.orderItemId,
            qty: stockAllocations.qty,
            delivered: sql<number>`(SELECT coalesce(sum(di.qty), 0)::int FROM delivery_items di WHERE di.allocation_id = ${stockAllocations.id})`,
          })
          .from(stockAllocations)
          .where(inArray(stockAllocations.orderItemId, itemIds))
          .for("update", { of: stockAllocations })
      : [];
    for (const a of stock) {
      if (a.delivered >= a.qty) continue;
      if (a.delivered === 0) await tx.delete(stockAllocations).where(eq(stockAllocations.id, a.id));
      else await tx.update(stockAllocations).set({ qty: a.delivered }).where(eq(stockAllocations.id, a.id));
    }

    const superseded = await tx
      .update(quotes)
      .set({ status: "superseded" })
      .where(and(eq(quotes.orderId, order.id), inArray(quotes.status, ["sent", "approved"])))
      .returning({ id: quotes.id });
    await tx.update(teamOrders).set({ status: "cancelled", cancelReason: reason.data }).where(eq(teamOrders.id, order.id));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team_order",
      entityId: order.id,
      action: "admin_cancel",
      before: { status: order.status },
      after: {
        status: "cancelled",
        reason: reason.data,
        surplus: plan.surplus,
        warnings: plan.warnings,
        released,
        stock: stock.filter((a) => a.delivered < a.qty),
        quoteIds: superseded.map((q) => q.id),
      },
    });
    return { ok: "ההזמנה בוטלה.", warnings: plan.warnings };
  });

  if (!result.error) refresh(orderId.data);
  return result;
}

type StockRow = { receiptLineId: string; orderItemId: string; qty: number; delivered: number };

/**
 * Brings a rejected or cancelled order back to where it was (reopenTarget): approved, waiting
 * for the team with its last quote open again, or waiting for a quote. Received units it held
 * before an admin cancel come back when they are still free; lines released from drafts go
 * back to the purchasing board.
 */
export async function reopenOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const orderId = z.uuid().safeParse(formData.get("orderId"));
  if (!orderId.success) return { error: "ההזמנה לא נמצאה" };

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const order = await lockOrder(tx, orderId.data);
    if (!order) return { error: "ההזמנה לא נמצאה" };
    if (!canReopen(order.status)) return { error: "ההזמנה כבר פתוחה" };

    const [stop] = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "team_order"), eq(auditLog.entityId, order.id), inArray(auditLog.action, ["cancel", "reject", "admin_cancel"])))
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(1);
    const stoppedFrom = ((stop?.before as { status?: OrderStatus } | null)?.status ?? null) as OrderStatus | null;
    const [latest] = await tx.select().from(quotes).where(eq(quotes.orderId, order.id)).orderBy(desc(quotes.version)).limit(1);
    const target = reopenTarget(stoppedFrom, latest?.status ?? null);

    if (latest && target.quote) await tx.update(quotes).set({ status: target.quote, rejectionReason: null }).where(eq(quotes.id, latest.id));
    await tx.update(teamOrders).set({ status: target.status, rejectionReason: null, cancelReason: null }).where(eq(teamOrders.id, order.id));

    // Received units it held before the admin cancelled: back to it, as far as the receipt line still has them free.
    let restored = 0;
    const held = stop?.action === "admin_cancel" && target.status === "approved" ? (((stop.after as { stock?: StockRow[] }).stock ?? []) as StockRow[]) : [];
    for (const row of held) {
      const [line] = await tx
        .select({
          good: sql<number>`(${receiptLines.qtyReceived} - ${receiptLines.qtyDamaged})::int`,
          taken: sql<number>`(SELECT coalesce(sum(sa.qty), 0)::int FROM stock_allocations sa WHERE sa.receipt_line_id = ${receiptLines.id})`,
        })
        .from(receiptLines)
        .where(eq(receiptLines.id, row.receiptLineId));
      if (!line) continue;
      const add = Math.min(row.qty - row.delivered, line.good - line.taken);
      if (add <= 0) continue;
      await tx
        .insert(stockAllocations)
        .values({ receiptLineId: row.receiptLineId, orderItemId: row.orderItemId, qty: add })
        .onConflictDoUpdate({ target: [stockAllocations.receiptLineId, stockAllocations.orderItemId], set: { qty: sql`${stockAllocations.qty} + ${add}` } });
      restored += add;
    }

    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team_order",
      entityId: order.id,
      action: "reopen",
      before: { status: order.status, reason: order.cancelReason ?? order.rejectionReason },
      after: { status: target.status, quoteId: target.quote ? latest?.id : undefined, restored: restored || undefined },
    });
    return { ok: "ההזמנה נפתחה מחדש." };
  });

  if (!result.error) refresh(orderId.data);
  return result;
}

/** Moves an order to another team, e.g. one sent from the wrong account. Its delivery details stay as they were. */
export async function moveOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ orderId: z.uuid(), teamId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "צריך לבחור קבוצה" };
  const { orderId, teamId } = parsed.data;

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const order = await lockOrder(tx, orderId);
    if (!order) return { error: "ההזמנה לא נמצאה" };
    const found = await tx.select().from(teams).where(inArray(teams.id, [order.teamId, teamId]));
    const from = found.find((t) => t.id === order.teamId);
    const to = found.find((t) => t.id === teamId);
    if (!to) return { error: "הקבוצה לא נמצאה" };
    const links = await getOrderLinks(tx, orderId);
    const blocked = moveBlocker({ fromTeamId: order.teamId, toTeamId: teamId, onDeliveryNotes: links.onDeliveryNotes });
    if (blocked) return { error: blocked };

    await tx.update(teamOrders).set({ teamId }).where(eq(teamOrders.id, orderId));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team_order",
      entityId: orderId,
      action: "move",
      before: { teamId: order.teamId, team: from ? teamDisplay(from) : null },
      after: { teamId, team: teamDisplay(to) },
    });
    return { ok: `ההזמנה הועברה אל ${teamDisplay(to)}.` };
  });

  if (!result.error) refresh(orderId);
  return result;
}

/**
 * Deletes an order nothing outside it points at (no supplier order, so no shipment or
 * delivery either): test data. Its items, quotes and approvals go with it; the audit log
 * keeps a copy, with the reason.
 */
export async function deleteOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const orderId = z.uuid().safeParse(formData.get("orderId"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!orderId.success) return { error: "ההזמנה לא נמצאה" };
  if (!reason.success) return { error: "נא לכתוב למה מוחקים (למשל: הזמנת ניסיון)" };

  const result = await db.transaction(async (tx): Promise<ActionState> => {
    const order = await lockOrder(tx, orderId.data);
    if (!order) return { error: "ההזמנה לא נמצאה" };
    const links = await getOrderLinks(tx, order.id);
    const blocked = deleteBlocker({ onSupplierOrders: links.onSupplierOrders, status: order.status });
    if (blocked) return { error: blocked };

    const items = await tx.select().from(teamOrderItems).where(eq(teamOrderItems.orderId, order.id));
    const quoteRows = await tx.select().from(quotes).where(eq(quotes.orderId, order.id));
    await tx.delete(teamOrders).where(eq(teamOrders.id, order.id));
    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team_order",
      entityId: order.id,
      action: "delete",
      before: { order, items, quotes: quoteRows },
      after: { reason: reason.data },
    });
    return { ok: `הזמנה ${order.number} נמחקה.` };
  });

  if (!result.error) refresh(orderId.data);
  return result;
}

/** Marks an order line "לא זמין" (the part is no longer sold), or clears the mark. */
export async function setItemUnavailable(itemId: string, unavailable: boolean): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(itemId);
  if (!id.success) return { error: "השורה לא נמצאה" };

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ item: teamOrderItems, status: teamOrders.status })
      .from(teamOrderItems)
      .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
      .where(eq(teamOrderItems.id, id.data))
      .for("update", { of: teamOrders });
    if (!row) return { error: "השורה לא נמצאה" };
    if (!canEditLines(row.status)) return { error: "אפשר לסמן רק בהזמנה פתוחה" };
    await markItems(tx, admin.id, [row.item], unavailable);
    return { orderId: row.item.orderId };
  });

  if ("error" in result) return { error: result.error };
  refresh(result.orderId);
  return {};
}

/** The same from a supplier order: every open team order line on that supplier-order line gets the mark. */
export async function setPoLineUnavailable(poLineId: string, unavailable: boolean): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(poLineId);
  if (!id.success) return { error: "השורה לא נמצאה" };

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ item: teamOrderItems, status: teamOrders.status, poId: poLines.poId })
      .from(poAllocations)
      .innerJoin(poLines, eq(poLines.id, poAllocations.poLineId))
      .innerJoin(teamOrderItems, eq(teamOrderItems.id, poAllocations.orderItemId))
      .innerJoin(teamOrders, eq(teamOrders.id, teamOrderItems.orderId))
      .where(eq(poAllocations.poLineId, id.data))
      .for("update", { of: teamOrders });
    const open = rows.filter((r) => canEditLines(r.status));
    if (open.length === 0) return { error: "אין בשורה הזאת הזמנות פתוחות" };
    await markItems(tx, admin.id, open.map((r) => r.item), unavailable);
    return { poId: rows[0].poId, orderIds: [...new Set(open.map((r) => r.item.orderId))] };
  });

  if ("error" in result) return { error: result.error };
  for (const orderId of result.orderIds) refresh(orderId);
  revalidatePath(`/admin/purchasing/${result.poId}`);
  return {};
}

async function markItems(tx: Tx, adminId: string, items: (typeof teamOrderItems.$inferSelect)[], unavailable: boolean) {
  const changing = items.filter((i) => !!i.unavailableAt !== unavailable);
  if (changing.length === 0) return;
  await tx
    .update(teamOrderItems)
    .set({ unavailableAt: unavailable ? new Date() : null })
    .where(inArray(teamOrderItems.id, changing.map((i) => i.id)));
  await tx.insert(auditLog).values(
    changing.map((i) => ({
      actorId: adminId,
      entity: "team_order",
      entityId: i.orderId,
      action: unavailable ? "mark_unavailable" : "unmark_unavailable",
      after: { itemId: i.id, sku: i.supplierSku, title: i.title },
    })),
  );
}

export type Replacement = {
  variantId: string;
  title: string;
  supplierName: string;
  supplierSku: string | null;
  options: { name: string; value: string }[];
  priceIls: number | null;
  available: boolean | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Parts to replace a line with: an exact SKU first (any spelling), then SKUs and names that start or contain the text. */
export async function findReplacements(query: string): Promise<Replacement[]> {
  await requireAdmin();
  const q = String(query ?? "").trim().slice(0, 100);
  if (q.length < 2) return [];
  const n = norm(q);
  const skuNorm = sql`regexp_replace(lower(${variants.supplierSku}), '[^a-z0-9]', '', 'g')`;
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const [rows, ctx] = await Promise.all([
    db
      .select({
        variantId: variants.id,
        title: products.title,
        supplierName: suppliers.name,
        supplierSku: variants.supplierSku,
        options: variants.options,
        priceUsd: variants.priceUsd,
        markup: variants.markup,
        fixedIls: variants.fixedIls,
        available: variants.available,
      })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
      .where(
        and(
          isNull(variants.missingSince),
          sql`${variants.priceUsd} IS NOT NULL`,
          n.length >= 2 ? sql`(${skuNorm} LIKE ${`${n}%`} OR ${products.title} ILIKE ${like})` : sql`${products.title} ILIKE ${like}`,
        ),
      )
      .orderBy(sql`(${skuNorm} = ${n}) DESC`, sql`(${skuNorm} LIKE ${`${n}%`}) DESC`, products.title)
      .limit(8),
    priceContext(),
  ]);
  return rows.map((r) => ({
    variantId: r.variantId,
    title: r.title,
    supplierName: r.supplierName,
    supplierSku: r.supplierSku,
    options: r.options,
    priceIls: priceIls(r.priceUsd, ctx, r.markup, r.fixedIls),
    available: r.available,
  }));
}

/**
 * Replaces a line's part with another one ("לא זמין" → another part). The line keeps its id
 * and quantity, and its snapshot is taken from the new part at today's price. A line on a
 * draft supplier order comes off it; one already ordered can't be replaced. When a quote went
 * out and the price changed, a new quote version goes to the team to approve again.
 */
export async function replaceItem(itemId: string, variantId: string): Promise<{ error?: string; version?: number }> {
  const admin = await requireAdmin();
  const ids = z.object({ itemId: z.uuid(), variantId: z.uuid() }).safeParse({ itemId, variantId });
  if (!ids.success) return { error: "הבקשה לא תקינה" };
  const ctx = await priceContext();

  const result = await db.transaction(async (tx): Promise<{ error: string } | { orderId: string; version?: number }> => {
    const [item] = await tx.select().from(teamOrderItems).where(eq(teamOrderItems.id, ids.data.itemId));
    if (!item) return { error: "השורה לא נמצאה" };
    const order = await lockOrder(tx, item.orderId);
    if (!order) return { error: "ההזמנה לא נמצאה" };

    const [part] = await tx
      .select({
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
        supplierSku: variants.supplierSku,
        options: variants.options,
        priceUsd: variants.priceUsd,
        markup: variants.markup,
        fixedIls: variants.fixedIls,
        title: products.title,
        productUrl: products.url,
      })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .innerJoin(suppliers, eq(suppliers.id, variants.supplierId))
      .where(eq(variants.id, ids.data.variantId));
    if (!part) return { error: "הפריט לא נמצא בקטלוג" };

    const [{ ordered }] = await tx
      .select({ ordered: sql<number>`coalesce(sum(${poAllocations.qty}), 0)::int` })
      .from(poAllocations)
      .innerJoin(poLines, eq(poLines.id, poAllocations.poLineId))
      .innerJoin(supplierPos, and(eq(supplierPos.id, poLines.poId), eq(supplierPos.status, "ordered")))
      .where(eq(poAllocations.orderItemId, item.id));
    const newPrice = priceIls(part.priceUsd, ctx, part.markup, part.fixedIls);
    const blocked = replaceBlocker({ status: order.status, ordered, sameVariant: item.variantId === ids.data.variantId, hasPrice: newPrice !== null });
    if (blocked || newPrice === null) return { error: blocked ?? "לפריט שנבחר אין מחיר בקטלוג" };

    const released = await releaseFromDrafts(tx, [item.id]);
    const snapshot = {
      variantId: ids.data.variantId,
      supplierCode: part.supplierCode,
      supplierName: part.supplierName,
      supplierSku: part.supplierSku,
      title: part.title,
      options: part.options,
      productUrl: part.productUrl,
      priceUsd: part.priceUsd!,
      // The same way the cart prices a line, so a later settings change never reprices it.
      multiplier: part.fixedIls ? (Number(part.fixedIls) / (Number(part.priceUsd) * ctx.rate)).toFixed(3) : String(Number(part.markup ?? ctx.markup)),
      usdIlsRate: String(ctx.rate),
      unitPriceIls: newPrice,
      pricedAt: new Date(),
      unavailableAt: null,
    };
    await tx.update(teamOrderItems).set(snapshot).where(eq(teamOrderItems.id, item.id));

    const quote = await currentQuote(tx, order.id);
    const quotedPrice = quote?.lines.find((l) => l.itemId === item.id)?.unitPriceIls ?? null;
    let version: number | undefined;
    if (quote && replacementNeedsApproval({ status: order.status, quotedPrice, newPrice })) {
      const label = (s: string | null, t: string) => s ?? t;
      const reason = `הפריט הוחלף: ${label(part.supplierSku, part.title)} במקום ${label(item.supplierSku, item.title)}`;
      ({ version } = await insertQuoteVersion(tx, {
        orderId: order.id,
        adminId: admin.id,
        orderStatus: order.status,
        shippingIls: quote.shippingIls,
        notes: quote.notes,
        lines: quote.lines.map((l) => ({
          itemId: l.itemId,
          qty: l.qty,
          unitPriceIls: l.itemId === item.id ? newPrice : l.unitPriceIls,
          changeReason: l.itemId === item.id ? reason : (l.changeReason ?? ""),
        })),
        revision: ordered > 0 || undefined,
        cause: "replace_item",
      }));
    }

    await tx.insert(auditLog).values({
      actorId: admin.id,
      entity: "team_order",
      entityId: order.id,
      action: "replace_item",
      before: { item, releasedFromDrafts: released.allocations.length ? released : undefined },
      after: { item: { id: item.id, ...snapshot }, version },
    });
    return { orderId: order.id, version };
  });

  if ("error" in result) return { error: result.error };
  if (result.version && emailEnabled()) notifyLater(() => notifyQuoteReady(result.orderId));
  refresh(result.orderId);
  return { version: result.version };
}
