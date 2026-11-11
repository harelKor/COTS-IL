import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/db";
import { teamDisplay } from "@/domain/display";
import {
  recipientsFor,
  reminderDue,
  stageDue,
  waitingTooLong,
  type NotifyEvent,
  type Recipient,
  type Stage,
  type TeamAddress,
} from "@/domain/notifications";
import { orderStatus } from "@/domain/order-status";
import { UNDO_SECONDS } from "@/domain/quote-view";
import { business } from "@/lib/business";
import { deliver, resendTransport, type Transport } from "@/lib/email-transport";
import { renderEmail, type EmailData, type EmailLine } from "@/lib/email-templates";
import { getOrderLines } from "@/lib/order-status";
import { getApproveLinks } from "@/lib/quote-links";
import { siteUrl } from "@/lib/site-url";

/**
 * Transactional email (S3). Every send runs with after(), once the action's transaction
 * has committed and the response has gone, so an email never slows or fails an action.
 * Without RESEND_API_KEY and EMAIL_FROM nothing is sent: one log line, and the app works
 * the same. Each send is logged in audit_log (entity of the order, action "email:<event>").
 */

const { auditLog, memberships, profiles, quotes, teamOrderItems, teamOrders, teams } = schema;

let override: Transport | null | undefined;
/** For local checks: a fake transport instead of Resend. */
export function setTransportForTesting(transport: Transport | null | undefined) {
  override = transport;
}
const transport = () => (override !== undefined ? override : resendTransport());

/** Whether email is set up, for copy that says what was sent. */
export const emailEnabled = () => transport() !== null;

/** Runs a notification after the response. Never throws into the action. */
export function notifyLater(task: () => Promise<unknown>) {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error("[notify] failed", error);
    }
  });
}

async function teamAddresses(teamId: string): Promise<TeamAddress[]> {
  return db
    .select({ userId: profiles.id, email: profiles.email, emailOff: memberships.emailOff })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(eq(memberships.teamId, teamId))
    .orderBy(asc(memberships.createdAt));
}

const adminAddresses = () => db.select({ userId: profiles.id, email: profiles.email }).from(profiles).where(eq(profiles.isAdmin, true));

type Send<E extends NotifyEvent> = {
  event: E;
  teamId: string | null;
  /** What the audit row points at. */
  entity: string;
  entityId: string;
  data: (r: Recipient) => EmailData[E];
  /** Extra fields on the audit row, e.g. the stage. */
  note?: Record<string, unknown>;
};

/** Finds the recipients, sends, and logs each email. Returns how many went out. */
export async function send<E extends NotifyEvent>(s: Send<E>): Promise<number> {
  const t = transport();
  if (!t) {
    console.info(`[notify] email is off (RESEND_API_KEY or EMAIL_FROM missing): ${s.event} for ${s.entity} ${s.entityId} not sent`);
    return 0;
  }
  const [team, admins] = await Promise.all([s.teamId ? teamAddresses(s.teamId) : Promise.resolve([]), adminAddresses()]);
  const recipients = recipientsFor(s.event, { team, admins });
  if (recipients.length === 0) return 0;
  const results = await deliver(recipients, (r) => renderEmail(s.event, r.audience, s.data(r)), t);
  await db.insert(auditLog).values(
    results.map((r) => ({
      actorId: null,
      entity: s.entity,
      entityId: s.entityId,
      action: `email:${s.event}`,
      after: { to: r.recipient.email, audience: r.recipient.audience, subject: r.subject, ok: r.ok, providerId: r.providerId, error: r.error, ...s.note },
    })),
  );
  for (const r of results) if (!r.ok) console.error(`[notify] ${s.event} to ${r.recipient.email} failed: ${r.error}`);
  return results.filter((r) => r.ok).length;
}

const orderUrl = (id: string) => `${siteUrl()}/orders/${id}`;
const adminOrderUrl = (id: string) => `${siteUrl()}/admin?open=${encodeURIComponent(id)}`;

async function orderWithTeam(orderId: string) {
  const [row] = await db
    .select({ order: teamOrders, team: teams })
    .from(teamOrders)
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .where(eq(teamOrders.id, orderId));
  return row ? { ...row, teamName: teamDisplay(row.team) } : null;
}

async function latestQuote(orderId: string) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.orderId, orderId)).orderBy(desc(quotes.version)).limit(1);
  if (!quote) return null;
  const lines = await db.select().from(schema.quoteLines).where(eq(schema.quoteLines.quoteId, quote.id));
  return { quote, totalIls: lines.reduce((sum, l) => sum + l.qty * l.unitPriceIls, 0) + quote.shippingIls };
}

/** "Request received": the team's copy of the lines and the admin's alert. */
export async function notifyRequest(orderId: string) {
  const row = await orderWithTeam(orderId);
  if (!row) return;
  const items = await db.select().from(teamOrderItems).where(eq(teamOrderItems.orderId, orderId)).orderBy(asc(teamOrderItems.title));
  const lines: EmailLine[] = items.map((i) => ({
    title: i.title,
    sku: i.supplierSku,
    options: optionsText(i.options),
    qty: i.qty,
    unitPriceIls: i.unitPriceIls,
  }));
  const totalIls = lines.reduce((sum, l) => sum + (l.unitPriceIls ?? 0) * l.qty, 0);
  await send({
    event: "request_received",
    teamId: row.team.id,
    entity: "team_order",
    entityId: orderId,
    data: () => ({ orderNumber: row.order.number, teamName: row.teamName, lines, totalIls, quoteDays: business.quoteLeadBusinessDays, orderUrl: orderUrl(orderId), adminUrl: adminOrderUrl(orderId) }),
  });
}

function optionsText(options: unknown): string | null {
  if (!options || typeof options !== "object") return null;
  const text = Object.values(options as Record<string, unknown>).filter((v) => typeof v === "string" && v).join(", ");
  return text || null;
}

/** "Quote ready": each team email with its own approve link. */
export async function notifyQuoteReady(orderId: string, event: "quote_ready" | "quote_reminder" = "quote_ready", days = 0) {
  const row = await orderWithTeam(orderId);
  const latest = await latestQuote(orderId);
  if (!row || !latest || latest.quote.status !== "sent") return 0;
  const links = await getApproveLinks(orderId);
  const urlFor = (userId: string) => (links && !links.missingSecret ? (links.members.find((m) => m.userId === userId)?.url ?? null) : null);
  const base = { orderNumber: row.order.number, teamName: row.teamName, orderUrl: orderUrl(orderId) };
  return event === "quote_ready"
    ? send({
        event: "quote_ready",
        teamId: row.team.id,
        entity: "quote",
        entityId: latest.quote.id,
        data: (r) => ({ ...base, totalIls: latest.totalIls, approveUrl: urlFor(r.userId), linkDays: 14 }),
      })
    : send({
        event: "quote_reminder",
        teamId: row.team.id,
        entity: "quote",
        entityId: latest.quote.id,
        data: (r) => ({ ...base, days, approveUrl: urlFor(r.userId) }),
      });
}

/** The team answered, or cancelled: the admin hears. */
export async function notifyDecision(
  orderId: string,
  event: "quote_approved" | "quote_rejected" | "order_cancelled" | "change_requested",
  reason: string | null = null,
) {
  const row = await orderWithTeam(orderId);
  if (!row) return;
  const base = { orderNumber: row.order.number, teamName: row.teamName, adminUrl: adminOrderUrl(orderId) };
  if (event === "quote_approved") {
    const latest = await latestQuote(orderId);
    await send({ event, teamId: null, entity: "team_order", entityId: orderId, data: () => ({ ...base, totalIls: latest?.totalIls ?? 0 }) });
  } else if (event === "quote_rejected" || event === "change_requested") {
    await send({ event, teamId: null, entity: "team_order", entityId: orderId, data: () => ({ ...base, reason }) });
  } else {
    await send({ event, teamId: null, entity: "team_order", entityId: orderId, data: () => base });
  }
}

/** The join link, to an address just added to the team (S8). Not in the team list yet, so sent directly. */
export async function notifyInvite(teamId: string, invitationId: string, email: string, url: string) {
  const t = transport();
  if (!t) {
    console.info(`[notify] email is off (RESEND_API_KEY or EMAIL_FROM missing): invite for ${invitationId} not sent`);
    return 0;
  }
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return 0;
  const [r] = await deliver([{ userId: "", email, audience: "team" }], (rcpt) => renderEmail("invite", rcpt.audience, { teamName: teamDisplay(team), url }), t);
  await db.insert(auditLog).values({
    actorId: null,
    entity: "team_invitation",
    entityId: invitationId,
    action: "email:invite",
    after: { to: email, subject: r.subject, ok: r.ok, providerId: r.providerId, error: r.error },
  });
  return r.ok ? 1 : 0;
}

/** An expired approve link asked for a new one: the admin resends the quote. */
export async function notifyLinkRequested(orderId: string, email: string) {
  const row = await orderWithTeam(orderId);
  if (!row) return;
  await send({
    event: "link_requested",
    teamId: null,
    entity: "team_order",
    entityId: orderId,
    data: () => ({ orderNumber: row.order.number, teamName: row.teamName, email, adminUrl: adminOrderUrl(orderId) }),
  });
}

/**
 * A decision the team can still undo (S8: 30 s) is only announced once the window has
 * closed and the decision still stands, so an undone approval never reaches the admin.
 */
export function notifyAfterUndo(stillStands: () => Promise<boolean>, task: () => Promise<unknown>) {
  notifyLater(async () => {
    await new Promise((r) => setTimeout(r, (UNDO_SECONDS + 2) * 1000));
    if (await stillStands()) await task();
  });
}

export async function notifyTeamSignedUp(teamId: string, email: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return;
  await send({
    event: "team_signed_up",
    teamId: null,
    entity: "team",
    entityId: teamId,
    data: () => ({ teamName: teamDisplay(team), contactName: team.contactName, email, adminUrl: `${siteUrl()}/admin/teams` }),
  });
}

export async function notifyJoinRequest(teamId: string, requestId: string, who: { email: string; name: string | null }) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return;
  await send({
    event: "join_request",
    teamId,
    entity: "team_join_request",
    entityId: requestId,
    data: () => ({ teamName: teamDisplay(team), email: who.email, name: who.name, teamUrl: `${siteUrl()}/team`, adminUrl: `${siteUrl()}/admin/teams` }),
  });
}

/** The approved orders a supplier order, a shipment or a delivery note touches. */
export async function ordersTouchedBy(ref: { poId?: string; shipmentId?: string; deliveryId?: string }): Promise<string[]> {
  const rows = ref.poId
    ? await db.execute<{ id: string }>(sql`
        SELECT DISTINCT i.order_id AS id FROM team_order_items i
        JOIN po_allocations a ON a.order_item_id = i.id JOIN po_lines l ON l.id = a.po_line_id
        WHERE l.po_id = ${ref.poId}`)
    : ref.shipmentId
      ? await db.execute<{ id: string }>(sql`
          SELECT DISTINCT i.order_id AS id FROM team_order_items i
          JOIN po_allocations a ON a.order_item_id = i.id JOIN shipment_items si ON si.po_line_id = a.po_line_id
          WHERE si.shipment_id = ${ref.shipmentId}`)
      : ref.deliveryId
        ? await db.execute<{ id: string }>(sql`
            SELECT DISTINCT i.order_id AS id FROM team_order_items i
            JOIN stock_allocations sa ON sa.order_item_id = i.id JOIN delivery_items di ON di.allocation_id = sa.id
            WHERE di.delivery_id = ${ref.deliveryId}`)
        : { rows: [] };
  return rows.rows.map((r) => r.id);
}

/**
 * Stage emails for the given orders: each one that reached a stage the team hasn't heard
 * about yet (stageDue) gets one email, read from the one order status (S13).
 */
export async function notifyStages(orderIds: string[]) {
  if (orderIds.length === 0 || !emailEnabled()) {
    if (orderIds.length > 0) console.info(`[notify] email is off: stage check for ${orderIds.length} orders skipped`);
    return;
  }
  const [orders, lines, sent] = await Promise.all([
    db
      .select({ order: teamOrders, team: teams })
      .from(teamOrders)
      .innerJoin(teams, eq(teams.id, teamOrders.teamId))
      .where(and(inArray(teamOrders.id, orderIds), eq(teamOrders.status, "approved"))),
    getOrderLines(orderIds),
    db
      .select({ entityId: auditLog.entityId, stage: sql<Stage>`${auditLog.after}->>'stage'` })
      .from(auditLog)
      .where(and(eq(auditLog.entity, "team_order"), eq(auditLog.action, "email:stage"), inArray(auditLog.entityId, orderIds))),
  ]);
  for (const { order, team } of orders) {
    const status = orderStatus(order.status, lines.filter((l) => l.orderId === order.id)).status;
    const stage = stageDue(status, sent.filter((s) => s.entityId === order.id).map((s) => s.stage));
    if (!stage) continue;
    await send({
      event: "stage",
      teamId: team.id,
      entity: "team_order",
      entityId: order.id,
      note: { stage },
      data: () => ({ orderNumber: order.number, teamName: teamDisplay(team), stage, pickup: order.deliveryMethod === "pickup", orderUrl: orderUrl(order.id) }),
    });
  }
}

/**
 * The daily job (called by the catalog sync workflow through /api/notify/daily): one
 * reminder per quote that has waited over three days, and the admin's digest of
 * requests still without a quote after a day.
 */
export async function runDailyNotifications(now = new Date()) {
  if (!emailEnabled()) {
    console.info("[notify] email is off: daily reminders and digest skipped");
    return { reminders: 0, digest: 0, enabled: false };
  }
  const waiting = await db
    .select({ orderId: teamOrders.id, quoteId: quotes.id, sentAt: quotes.sentAt })
    .from(quotes)
    .innerJoin(teamOrders, eq(teamOrders.id, quotes.orderId))
    .where(and(eq(quotes.status, "sent"), eq(teamOrders.status, "quote_sent")));
  const reminded = new Set(
    waiting.length === 0
      ? []
      : (
          await db
            .select({ id: auditLog.entityId })
            .from(auditLog)
            .where(and(eq(auditLog.entity, "quote"), eq(auditLog.action, "email:quote_reminder"), inArray(auditLog.entityId, waiting.map((w) => w.quoteId))))
        ).map((r) => r.id),
  );
  let reminders = 0;
  for (const w of waiting) {
    if (!reminderDue(w.sentAt, reminded.has(w.quoteId), now)) continue;
    const days = Math.floor((now.getTime() - w.sentAt.getTime()) / 86_400_000);
    reminders += await notifyQuoteReady(w.orderId, "quote_reminder", days);
  }

  const open = await db
    .select({ order: teamOrders, team: teams })
    .from(teamOrders)
    .innerJoin(teams, eq(teams.id, teamOrders.teamId))
    .where(eq(teamOrders.status, "submitted"))
    .orderBy(asc(teamOrders.submittedAt));
  const late = open.filter((o) => o.order.submittedAt && waitingTooLong(o.order.submittedAt, now));
  let digest = 0;
  if (late.length > 0) {
    digest = await send({
      event: "admin_digest",
      teamId: null,
      entity: "digest",
      entityId: now.toISOString().slice(0, 10),
      data: () => ({
        adminUrl: `${siteUrl()}/admin`,
        items: late.map((o) => ({
          orderNumber: o.order.number,
          teamName: teamDisplay(o.team),
          hours: Math.floor((now.getTime() - o.order.submittedAt!.getTime()) / 3_600_000),
          url: adminOrderUrl(o.order.id),
        })),
      }),
    });
  }
  return { reminders, digest, enabled: true };
}

/** Stage emails for whatever a supplier order, shipment or delivery note touched, after the response. */
export function notifyStagesLater(ref: { poId?: string; shipmentId?: string; deliveryId?: string }) {
  if (!emailEnabled()) return;
  notifyLater(async () => notifyStages(await ordersTouchedBy(ref)));
}
