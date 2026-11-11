"use server";

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { canCancelOrder, canDecideQuote, quoteContentHash, teamCanOrder } from "@/domain/orders";
import { readQuoteLinkToken, readSignedQuoteLinkToken } from "@/domain/quote-link";
import { UNDO_SECONDS } from "@/domain/quote-view";
import { getViewer } from "@/lib/auth";
import { notifyAfterUndo, notifyDecision, notifyLater, notifyLinkRequested } from "@/lib/notify";
import { orderSupplierLock } from "@/lib/purchasing";

const { auditLog, memberships, profiles, quoteApprovals, quoteLines, quotes, teamOrders, teams } = schema;

export type Decision = "approve" | "change" | "reject";
export type DecisionState = { error?: string; done?: Decision; quoteId?: string };

/**
 * Who answers: someone signed in to the team, or the email an approve link was made for
 * (D4: recorded against that email). The link also pins the quote's content.
 */
type Actor = { userId: string; via: "account" | "link"; contentHash?: string };

async function actorFor(input: { quoteId: string; token?: string }): Promise<Actor | { error: string }> {
  if (input.token) {
    const claims = readQuoteLinkToken(input.token, process.env.QUOTE_LINK_SECRET);
    if (!claims || claims.quoteId !== input.quoteId) return { error: "הקישור אינו תקף או שפג תוקפו." };
    return { userId: claims.userId, via: "link", contentHash: claims.contentHash };
  }
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return { userId: viewer.id, via: "account" };
}

/** The actor is (still) on the order's team, and the team may order. */
async function onTeam(tx: Pick<typeof db, "select">, userId: string, teamId: string) {
  const [row] = await tx
    .select({ status: teams.status })
    .from(memberships)
    .innerJoin(teams, eq(teams.id, memberships.teamId))
    .where(and(eq(memberships.teamId, teamId), eq(memberships.userId, userId)));
  return !!row && teamCanOrder(row.status);
}

const decisionSchema = z.object({
  quoteId: z.uuid(),
  token: z.string().max(2000).optional(),
  decision: z.enum(["approve", "change", "reject"]),
  reason: z.string().trim().max(1000).default(""),
});

/**
 * The team's answer to a quote (S8): approve, ask for a change (the order stays open,
 * nothing stored changes, D3), or reject. The form names the quote it showed, so an answer
 * to an older version doesn't count. Approve and reject can be undone for UNDO_SECONDS, and
 * the admin hears only once that window has closed.
 */
export async function decideQuote(input: z.input<typeof decisionSchema>): Promise<DecisionState> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { error: "הבקשה לא תקינה" };
  const { quoteId, decision, reason } = parsed.data;
  if (decision === "change" && !reason) return { error: "כתבו מה לשנות" };
  const actor = await actorFor(parsed.data);
  if ("error" in actor) return actor;

  const result = await db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) return { error: "ההצעה לא נמצאה" };
    const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, quote.orderId)).for("update");
    if (!(await onTeam(tx, actor.userId, order.teamId))) return { error: "רק מי שמחובר/ת לחשבון הקבוצה יכול/ה לענות על הצעה" };

    // Read again under the order's lock, in case a new version was sent while we waited for it.
    const [current] = await tx.select().from(quotes).where(eq(quotes.id, quoteId));
    const lines = await tx.select().from(quoteLines).where(eq(quoteLines.quoteId, quoteId));
    const hash = quoteContentHash({ orderId: order.id, version: current.version, shippingIls: current.shippingIls, lines });
    if (current.status !== "sent" || !canDecideQuote(order.status) || (actor.contentHash && actor.contentHash !== hash)) {
      return { error: "ההצעה הזאת כבר לא בתוקף. רעננו את העמוד כדי לראות את הגרסה האחרונה." };
    }

    if (decision === "approve") {
      await tx.update(quotes).set({ status: "approved" }).where(eq(quotes.id, quoteId));
      await tx.update(teamOrders).set({ status: "approved" }).where(eq(teamOrders.id, order.id));
      await tx.insert(quoteApprovals).values({ quoteId, userId: actor.userId, contentHash: hash });
    } else if (decision === "reject") {
      await tx.update(quotes).set({ status: "rejected", rejectionReason: reason || null }).where(eq(quotes.id, quoteId));
      await tx.update(teamOrders).set({ status: "rejected" }).where(eq(teamOrders.id, order.id));
    }

    await tx.insert(auditLog).values({
      actorId: actor.userId,
      entity: "quote",
      entityId: quoteId,
      action: decision === "change" ? "change_request" : decision,
      before: { orderStatus: order.status },
      after: { version: current.version, reason: reason || undefined, via: actor.via },
    });
    return { orderId: order.id };
  });

  if ("error" in result) return { error: result.error };
  const { orderId } = result;
  if (decision === "change") {
    notifyLater(() => notifyDecision(orderId, "change_requested", reason));
  } else {
    const status = decision === "approve" ? "approved" : "rejected";
    notifyAfterUndo(
      async () => (await db.select({ status: quotes.status }).from(quotes).where(eq(quotes.id, quoteId)))[0]?.status === status,
      () => notifyDecision(orderId, decision === "approve" ? "quote_approved" : "quote_rejected", reason || null),
    );
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/admin", "layout");
  return { done: decision, quoteId };
}

const recent = () => new Date(Date.now() - (UNDO_SECONDS + 5) * 1000);

/**
 * Takes back an approval or rejection made in the last UNDO_SECONDS (a few seconds of grace
 * for the round trip), as long as nothing was ordered from a supplier for it. The quote goes
 * back to waiting for the team; the approval record is removed.
 */
export async function undoDecision(input: { quoteId: string; token?: string }): Promise<DecisionState> {
  const quoteId = z.uuid().safeParse(input.quoteId);
  if (!quoteId.success) return { error: "הבקשה לא תקינה" };
  const actor = await actorFor({ quoteId: quoteId.data, token: input.token });
  if ("error" in actor) return actor;

  const result = await db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId.data));
    if (!quote) return { error: "ההצעה לא נמצאה" };
    const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, quote.orderId)).for("update");
    if (!(await onTeam(tx, actor.userId, order.teamId))) return { error: "אין הרשאה" };
    const [last] = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "quote"), eq(auditLog.entityId, quote.id), inArray(auditLog.action, ["approve", "reject"]), gte(auditLog.at, recent())))
      .orderBy(desc(auditLog.at))
      .limit(1);
    const [current] = await tx.select().from(quotes).where(eq(quotes.id, quote.id));
    const decided = current.status === "approved" ? "approve" : current.status === "rejected" ? "reject" : null;
    if (!last || !decided || last.action !== decided) return { error: "עבר הזמן לביטול. אפשר לפנות לספק הישראלי." };
    if (decided === "approve" && (await orderSupplierLock(tx, order.id))) return { error: "הספק הישראלי כבר התחיל להזמין. פנו אליו." };

    await tx.update(quotes).set({ status: "sent", rejectionReason: null }).where(eq(quotes.id, quote.id));
    await tx.update(teamOrders).set({ status: "quote_sent" }).where(eq(teamOrders.id, order.id));
    if (decided === "approve") await tx.delete(quoteApprovals).where(eq(quoteApprovals.quoteId, quote.id));
    await tx.insert(auditLog).values({
      actorId: actor.userId,
      entity: "quote",
      entityId: quote.id,
      action: "undo",
      before: { status: current.status },
      after: { status: "sent", undid: decided, via: actor.via },
    });
    return { orderId: order.id };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath(`/orders/${result.orderId}`);
  revalidatePath("/orders");
  revalidatePath("/admin", "layout");
  return {};
}

export type CancelState = { error?: string; cancelled?: boolean; restored?: boolean };

export async function cancelOrder(orderIdInput: string): Promise<CancelState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const parsed = z.uuid().safeParse(orderIdInput);
  if (!parsed.success) return { error: "ההזמנה לא נמצאה" };
  const orderId = parsed.data;

  const cancelled = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, orderId)).for("update");
    const membership = order && viewer.teams.find((t) => t.id === order.teamId && teamCanOrder(t.status));
    if (!membership || !canCancelOrder(order.status)) return false;

    await tx.update(teamOrders).set({ status: "cancelled" }).where(eq(teamOrders.id, orderId));
    const superseded = await tx
      .update(quotes)
      .set({ status: "superseded" })
      .where(and(eq(quotes.orderId, orderId), eq(quotes.status, "sent")))
      .returning({ id: quotes.id });
    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "team_order",
      entityId: orderId,
      action: "cancel",
      before: { status: order.status },
      after: { status: "cancelled", quoteIds: superseded.map((q) => q.id) },
    });
    return true;
  });
  if (!cancelled) return { error: "אי אפשר לבטל את ההזמנה הזאת" };
  notifyAfterUndo(
    async () => (await db.select({ status: teamOrders.status }).from(teamOrders).where(eq(teamOrders.id, orderId)))[0]?.status === "cancelled",
    () => notifyDecision(orderId, "order_cancelled"),
  );
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/admin", "layout");
  return { cancelled: true };
}

/** Brings back an order cancelled in the last UNDO_SECONDS, as it was (and its quote, if one waited). */
export async function undoCancel(orderIdInput: string): Promise<CancelState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const parsed = z.uuid().safeParse(orderIdInput);
  if (!parsed.success) return { error: "ההזמנה לא נמצאה" };
  const orderId = parsed.data;

  const restored = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(teamOrders).where(eq(teamOrders.id, orderId)).for("update");
    const membership = order && viewer.teams.find((t) => t.id === order.teamId && teamCanOrder(t.status));
    if (!membership || order.status !== "cancelled") return false;
    const [last] = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, "team_order"), eq(auditLog.entityId, orderId), eq(auditLog.action, "cancel"), gte(auditLog.at, recent())))
      .orderBy(desc(auditLog.at))
      .limit(1);
    const before = (last?.before as { status?: "submitted" | "quote_sent" } | null)?.status;
    if (!last || (before !== "submitted" && before !== "quote_sent")) return false;
    const quoteIds = ((last.after as { quoteIds?: string[] } | null)?.quoteIds ?? []).filter((id) => z.uuid().safeParse(id).success);

    await tx.update(teamOrders).set({ status: before }).where(eq(teamOrders.id, orderId));
    if (quoteIds.length) await tx.update(quotes).set({ status: "sent" }).where(and(inArray(quotes.id, quoteIds), eq(quotes.status, "superseded")));
    await tx.insert(auditLog).values({
      actorId: viewer.id,
      entity: "team_order",
      entityId: orderId,
      action: "undo_cancel",
      before: { status: "cancelled" },
      after: { status: before },
    });
    return true;
  });
  if (!restored) return { error: "עבר הזמן לביטול. אפשר לפנות לספק הישראלי." };
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/admin", "layout");
  return { restored: true };
}

export type LinkRequestState = { error?: string; sent?: boolean };

/**
 * "בקשו קישור חדש" on an expired approve link: tells the admin, once a day per link's
 * email and quote, so reloading the page can't flood them.
 */
export async function requestNewLink(token: string): Promise<LinkRequestState> {
  const claims = readSignedQuoteLinkToken(token, process.env.QUOTE_LINK_SECRET);
  if (!claims) return { error: "הקישור אינו תקף." };
  const [quote] = await db.select({ orderId: quotes.orderId }).from(quotes).where(eq(quotes.id, claims.quoteId));
  if (!quote) return { error: "ההצעה לא נמצאה." };
  const [person] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, claims.userId));
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [already] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "quote"), eq(auditLog.entityId, claims.quoteId), eq(auditLog.action, "link_request"), eq(auditLog.actorId, claims.userId), gte(auditLog.at, dayAgo)))
    .limit(1);
  if (!already) {
    await db.insert(auditLog).values({ actorId: claims.userId, entity: "quote", entityId: claims.quoteId, action: "link_request" });
    notifyLater(() => notifyLinkRequested(quote.orderId, person?.email ?? ""));
  }
  revalidatePath("/admin", "layout");
  return { sent: true };
}
