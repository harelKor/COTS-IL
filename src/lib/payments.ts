import "server-only";
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { teamDisplay } from "@/domain/display";
import type { OrderStatus } from "@/domain/orders";
import { moneyState, owedFor, teamBalance, type OrderMoney, type PaymentExportRow, type PaymentMethod, type TeamBalance } from "@/domain/payments";

/**
 * What P1's screens read (docs/PAYMENTS-MORNING-PLAN.md): each order's approved total and
 * what was paid on it, the payment list, and the teams' balances. Nothing about money is
 * stored besides the payments; src/domain/payments.ts works out the rest.
 */

const { payments, profiles, teamOrders, teams } = schema;

type Reader = Pick<typeof db, "execute">;

export type OrderMoneyRow = {
  orderId: string;
  number: number;
  teamId: string;
  status: OrderStatus;
  /** The latest approved quote version's total (lines plus shipping); null while none is approved. */
  approvedTotal: number | null;
  approvedAt: Date | null;
  money: OrderMoney;
};

/**
 * Each order's approved total and paid sum. The owed version is the latest one approved (its
 * status, or an approval row once it was superseded): a new version sent after approval
 * doesn't change what is owed until the team approves it, and an undone approval owes nothing.
 */
async function moneyRows(where: SQL, reader: Reader = db): Promise<OrderMoneyRow[]> {
  const { rows } = await reader.execute<{
    id: string;
    number: number;
    team_id: string;
    status: OrderStatus;
    approved_total: number | null;
    approved_at: string | Date | null;
    paid: string;
  }>(sql`
    SELECT o.id, o.number, o.team_id, o.status, aq.total AS approved_total, aq.approved_at,
      coalesce((SELECT sum(p.amount_ils) FROM payments p WHERE p.order_id = o.id AND p.voided_at IS NULL), 0)::text AS paid
    FROM team_orders o
    LEFT JOIN LATERAL (
      SELECT (q.shipping_ils + coalesce((SELECT sum(ql.qty * ql.unit_price_ils) FROM quote_lines ql WHERE ql.quote_id = q.id), 0))::int AS total,
        coalesce((SELECT max(a.at) FROM quote_approvals a WHERE a.quote_id = q.id), q.sent_at) AS approved_at
      FROM quotes q
      WHERE q.order_id = o.id AND (q.status = 'approved' OR EXISTS (SELECT 1 FROM quote_approvals a WHERE a.quote_id = q.id))
      ORDER BY q.version DESC
      LIMIT 1
    ) aq ON true
    WHERE ${where}
    ORDER BY o.number
  `);
  return rows.map((r) => {
    const approvedTotal = r.approved_total === null ? null : Number(r.approved_total);
    return {
      orderId: r.id,
      number: r.number,
      teamId: r.team_id,
      status: r.status,
      approvedTotal,
      approvedAt: r.approved_at ? new Date(r.approved_at) : null,
      money: moneyState(owedFor(r.status, approvedTotal), Number(r.paid)),
    };
  });
}

const idList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/** The money state of these orders, by id. */
export async function getMoneyByOrder(orderIds: string[], reader: Reader = db): Promise<Map<string, OrderMoneyRow>> {
  if (orderIds.length === 0) return new Map();
  const rows = await moneyRows(sql`o.id IN (${idList(orderIds)})`, reader);
  return new Map(rows.map((r) => [r.orderId, r]));
}

export async function getOrderMoney(orderId: string, reader: Reader = db): Promise<OrderMoneyRow | null> {
  return (await getMoneyByOrder([orderId], reader)).get(orderId) ?? null;
}

const voider = alias(profiles, "voider");

/** Payments, newest first, with who recorded and who voided them. */
export async function listPayments(filter: { orderId: string } | { teamId: string }) {
  return db
    .select({
      id: payments.id,
      orderId: payments.orderId,
      orderNumber: teamOrders.number,
      teamId: payments.teamId,
      amountIls: payments.amountIls,
      paidAt: payments.paidAt,
      method: payments.method,
      reference: payments.reference,
      morningDocNo: payments.morningDocNo,
      /** P3: the Morning document issued for it, when the site issued one. */
      documentId: payments.documentId,
      note: payments.note,
      createdAt: payments.createdAt,
      createdBy: sql<string>`coalesce(${profiles.fullName}, ${profiles.email})`,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
      voidedBy: sql<string | null>`coalesce(${voider.fullName}, ${voider.email})`,
    })
    .from(payments)
    .innerJoin(profiles, eq(profiles.id, payments.createdBy))
    .leftJoin(voider, eq(voider.id, payments.voidedBy))
    .leftJoin(teamOrders, eq(teamOrders.id, payments.orderId))
    .where("orderId" in filter ? eq(payments.orderId, filter.orderId) : eq(payments.teamId, filter.teamId))
    .orderBy(desc(payments.paidAt), desc(payments.createdAt));
}
export type PaymentRow = Awaited<ReturnType<typeof listPayments>>[number];

/** Payments on account (no order) that aren't voided, per team. */
async function onAccountByTeam(teamId?: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ teamId: payments.teamId, sum: sql<string>`sum(${payments.amountIls})::text` })
    .from(payments)
    .where(and(isNull(payments.orderId), isNull(payments.voidedAt), teamId ? eq(payments.teamId, teamId) : undefined))
    .groupBy(payments.teamId);
  return new Map(rows.map((r) => [r.teamId, Number(r.sum)]));
}

const balanceOrders = (rows: OrderMoneyRow[]) =>
  rows.map((r) => ({ orderId: r.orderId, number: r.number, owed: r.money.owed, paid: r.money.paid, approvedAt: r.approvedAt }));

/** One team's balance and ageing, with its orders' money states. */
export async function getTeamBalance(teamId: string, now = new Date()): Promise<{ balance: TeamBalance; orders: OrderMoneyRow[]; onAccount: number }> {
  const [rows, onAccount] = await Promise.all([moneyRows(sql`o.team_id = ${teamId}`), onAccountByTeam(teamId)]);
  const credit = onAccount.get(teamId) ?? 0;
  return { balance: teamBalance(balanceOrders(rows), credit, now), orders: rows, onAccount: credit };
}

export type TeamBalanceRow = { teamId: string; label: string; name: string; program: string; number: number; balance: TeamBalance };

/** Every team with money on record (an approved order or a payment), with its balance. */
export async function getBalances(now = new Date()): Promise<TeamBalanceRow[]> {
  const [rows, onAccount, teamRows] = await Promise.all([
    moneyRows(sql`(EXISTS (SELECT 1 FROM quotes q WHERE q.order_id = o.id
        AND (q.status = 'approved' OR EXISTS (SELECT 1 FROM quote_approvals a WHERE a.quote_id = q.id)))
      OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id))`),
    onAccountByTeam(),
    db.select({ id: teams.id, name: teams.name, program: teams.program, number: teams.number }).from(teams).orderBy(asc(teams.program), asc(teams.number)),
  ]);
  const byTeam = new Map<string, OrderMoneyRow[]>();
  for (const r of rows) byTeam.set(r.teamId, [...(byTeam.get(r.teamId) ?? []), r]);
  return teamRows
    .filter((t) => byTeam.has(t.id) || onAccount.has(t.id))
    .map((t) => ({
      teamId: t.id,
      label: teamDisplay(t),
      name: t.name,
      program: t.program,
      number: t.number,
      balance: teamBalance(balanceOrders(byTeam.get(t.id) ?? []), onAccount.get(t.id) ?? 0, now),
    }));
}

/** The bookkeeper's CSV rows: payments by the day they arrived, in the period (Israel dates, inclusive). */
export async function getPaymentsExport(period: { from?: string; to?: string }): Promise<PaymentExportRow[]> {
  const rows = await db
    .select({
      paidAt: payments.paidAt,
      teamName: teams.name,
      teamProgram: teams.program,
      teamNumber: teams.number,
      orderNumber: teamOrders.number,
      amountIls: payments.amountIls,
      method: payments.method,
      reference: payments.reference,
      morningDocNo: payments.morningDocNo,
      // The order's Morning numbers, from the newest quote version that has each.
      morningQuoteNo: sql<string | null>`(SELECT q.morning_quote_no FROM quotes q WHERE q.order_id = ${payments.orderId} AND q.morning_quote_no IS NOT NULL ORDER BY q.version DESC LIMIT 1)`,
      morningDealNo: sql<string | null>`(SELECT q.morning_deal_no FROM quotes q WHERE q.order_id = ${payments.orderId} AND q.morning_deal_no IS NOT NULL ORDER BY q.version DESC LIMIT 1)`,
      note: payments.note,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
    })
    .from(payments)
    .innerJoin(teams, eq(teams.id, payments.teamId))
    .leftJoin(teamOrders, eq(teamOrders.id, payments.orderId))
    .where(
      and(
        period.from ? sql`${payments.paidAt} >= ${period.from}::date` : undefined,
        period.to ? sql`${payments.paidAt} <= ${period.to}::date` : undefined,
      ),
    )
    .orderBy(asc(payments.paidAt), asc(payments.createdAt));
  return rows.map((r) => ({
    paidAt: r.paidAt,
    team: teamDisplay({ name: r.teamName, program: r.teamProgram, number: r.teamNumber }),
    orderNumber: r.orderNumber,
    amountIls: r.amountIls,
    method: r.method as PaymentMethod,
    reference: r.reference,
    // Typed by hand from Morning; P3 fills it from billing_documents.
    documentNumber: r.morningDocNo,
    morningQuoteNo: r.morningQuoteNo,
    morningDealNo: r.morningDealNo,
    note: r.note,
    voidedAt: r.voidedAt,
    voidReason: r.voidReason,
  }));
}

/** The order's payments that aren't voided, for the delete guard. */
export async function livePayments(orderId: string, reader: Pick<typeof db, "select"> = db) {
  return reader
    .select({ amountIls: payments.amountIls, voidedAt: payments.voidedAt })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), isNull(payments.voidedAt)));
}
