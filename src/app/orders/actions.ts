"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { canApproveQuote, canCancelOrder, canDecideQuote, canOrder, quoteContentHash } from "@/domain/orders";
import { getViewer } from "@/lib/auth";

const { auditLog, quoteApprovals, quoteLines, quotes, teamOrders } = schema;

export type DecisionState = { error?: string };

const decisionSchema = z.object({
  quoteId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).default(""),
});

/**
 * The team's explicit answer to a quote. The form names the quote it showed, so
 * if the mentor sent a newer version in the meantime the answer doesn't count.
 */
export async function decideQuote(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const parsed = decisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "הבקשה לא תקינה" };
  const { quoteId, decision, reason } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) return { error: "ההצעה לא נמצאה" };

    const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, quote.orderId)).for("update");
    const membership = viewer.teams.find((t) => t.id === order.teamId && t.status === "active");
    if (!membership || !canApproveQuote(membership.role)) return { error: "רק מנהל הקבוצה יכול לאשר או לדחות הצעה" };

    // Read again under the order's lock, in case a new version was sent while we waited for it.
    const [current] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
    if (current.status !== "sent" || !canDecideQuote(order.status)) {
      return { error: "ההצעה הזאת כבר לא בתוקף. רעננו את העמוד כדי לראות את הגרסה האחרונה." };
    }

    if (decision === "approve") {
      const lines = await tx.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId));
      await tx.update(quotes).set({ status: "approved" }).where(eq(quotes.id, quoteId));
      await tx.update(teamOrders).set({ status: "approved" }).where(eq(teamOrders.id, order.id));
      await tx.insert(quoteApprovals).values({
        quoteId,
        userId: viewer.id,
        contentHash: quoteContentHash({
          orderId: order.id,
          version: current.version,
          shippingIls: current.shippingIls,
          lines,
        }),
      });
    } else {
      await tx.update(quotes).set({ status: "rejected", rejectionReason: reason || null }).where(eq(quotes.id, quoteId));
      await tx.update(teamOrders).set({ status: "rejected" }).where(eq(teamOrders.id, order.id));
    }

    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "quote",
      entityId: quoteId,
      action: decision,
      before: { orderStatus: order.status },
      after: { version: current.version, reason: reason || undefined },
    });
    return { orderId: order.id };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath(`/orders/${result.orderId}`);
  revalidatePath(`/admin/orders/${result.orderId}`);
  return {};
}

export async function cancelOrder(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const orderId = z.uuid().parse(formData.get("orderId"));

  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, orderId)).for("update");
    const membership = order && viewer.teams.find((t) => t.id === order.teamId && t.status === "active");
    if (!membership || !canOrder(membership.role) || !canCancelOrder(order.status)) return;

    await tx.update(teamOrders).set({ status: "cancelled" }).where(eq(teamOrders.id, orderId));
    await tx
      .update(quotes)
      .set({ status: "superseded" })
      .where(and(eq(quotes.orderId, orderId), eq(quotes.status, "sent")));
    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "team_order",
      entityId: orderId,
      action: "cancel",
      before: { status: order.status },
      after: { status: "cancelled" },
    });
  });

  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
}
