import { z } from "zod";
import type { OrderStatus } from "./orders";
import { formatIls, toAgorot } from "./pricing";

/**
 * Payments and balances (P1, docs/PAYMENTS-MORNING-PLAN.md). The admin records what a team
 * paid; nothing here is stored. An order's money state and a team's balance are worked out
 * from the payments that aren't voided and the approved quote's total:
 *  - owed: the total (lines plus shipping) of the latest quote version the team approved, or
 *    nothing while none is, and nothing for a cancelled or rejected order;
 *  - paid: the sum of the order's payments that aren't voided.
 * Sums run in whole agorot, so 0.1 + 0.2 never drifts.
 */

export const PAYMENT_METHODS = ["transfer", "card", "cheque", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "העברה בנקאית",
  card: "כרטיס אשראי",
  cheque: "צ׳ק",
  cash: "מזומן",
  other: "אחר",
};

export type MoneyState = "none" | "unpaid" | "partial" | "paid" | "overpaid";

export type PaymentLike = { amountIls: string | number; voidedAt: Date | string | null };

const fromAgorot = (a: number) => a / 100;

/** The sum of the payments that aren't voided, in shekels (to the agora). */
export function paidTotal(payments: PaymentLike[]): number {
  return fromAgorot(payments.filter((p) => !p.voidedAt).reduce((sum, p) => sum + toAgorot(Number(p.amountIls)), 0));
}

/** What an order owes: its approved quote's total, or nothing before approval or once it stopped. */
export function owedFor(status: OrderStatus, approvedTotalIls: number | null): number {
  if (status === "cancelled" || status === "rejected") return 0;
  return approvedTotalIls ?? 0;
}

export type OrderMoney = {
  owed: number;
  paid: number;
  /** What is still to pay; 0 once paid. */
  left: number;
  /** Paid beyond what is owed (a cancelled order that was paid, a quote lowered after payment). */
  over: number;
  state: MoneyState;
};

/** An order's money state from what it owes and what was paid. */
export function moneyState(owedIls: number, paidIls: number): OrderMoney {
  const owed = toAgorot(owedIls);
  const paid = toAgorot(paidIls);
  const state: MoneyState =
    owed === 0 && paid === 0 ? "none" : paid > owed ? "overpaid" : paid === owed ? "paid" : paid === 0 ? "unpaid" : "partial";
  return {
    owed: fromAgorot(owed),
    paid: fromAgorot(paid),
    left: fromAgorot(Math.max(0, owed - paid)),
    over: fromAgorot(Math.max(0, paid - owed)),
    state,
  };
}

export function orderMoney(input: { status: OrderStatus; approvedTotalIls: number | null; payments: PaymentLike[] }): OrderMoney {
  return moneyState(owedFor(input.status, input.approvedTotalIls), paidTotal(input.payments));
}

/** True while the order still has money to collect: the unpaid filter on /admin. */
export const isUnpaid = (m: Pick<OrderMoney, "state">) => m.state === "unpaid" || m.state === "partial";

/** The admin's words and the tag tone for each state. */
export const MONEY_ADMIN: Record<Exclude<MoneyState, "none">, { label: string; tone: "warning" | "success" | "brand" | "danger" }> = {
  unpaid: { label: "לא שולם", tone: "warning" },
  partial: { label: "שולם חלקית", tone: "warning" },
  paid: { label: "שולם", tone: "success" },
  overpaid: { label: "שולם ביתר", tone: "brand" },
};

/**
 * What the team reads on /orders and /orders/<id>: "שולם", "שולם חלקית (₪X נותרו)" or
 * "ממתין לתשלום". Null while nothing is owed (before approval, a cancelled order unpaid).
 */
export function teamMoneyLabel(m: OrderMoney): { label: string; tone: "warning" | "success" } | null {
  switch (m.state) {
    case "none":
      return null;
    case "unpaid":
      return { label: "ממתין לתשלום", tone: "warning" };
    case "partial":
      return { label: `שולם חלקית (${formatIls(m.left, { agorot: true })} נותרו)`, tone: "warning" };
    case "paid":
    case "overpaid":
      return { label: "שולם", tone: "success" };
  }
}

export const AGEING_BUCKETS = ["0-30", "31-60", "60+"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export const AGEING_LABEL: Record<AgeingBucket, string> = { "0-30": "עד 30 יום", "31-60": "31 עד 60 יום", "60+": "מעל 60 יום" };

const DAY = 86_400_000;

/** Whole days since the approval, never negative. */
export function daysSince(at: Date | string | null, now: Date): number {
  if (!at) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / DAY));
}

export function ageingBucket(days: number): AgeingBucket {
  return days <= 30 ? "0-30" : days <= 60 ? "31-60" : "60+";
}

export type BalanceOrder = { orderId: string; number: number; owed: number; paid: number; approvedAt: Date | string | null };

export type TeamBalance = {
  /** Everything owed, and everything paid (on orders and on account). */
  owed: number;
  paid: number;
  /** owed − paid: positive when the team owes, negative when it has credit. */
  balance: number;
  /** What the team still owes, by days since each order's approval, after credit is used up oldest first. */
  ageing: Record<AgeingBucket, number>;
  /** The orders still owing after credit, oldest approval first. */
  open: { orderId: string; number: number; left: number; days: number }[];
  /** Days since the oldest approval still owing; null when nothing is. */
  oldestDays: number | null;
};

/**
 * A team's balance and ageing. Credit (payments on account, and overpayments on other
 * orders) pays the oldest open order first, the way a bookkeeper would apply it.
 */
export function teamBalance(orders: BalanceOrder[], onAccountIls: number, now: Date): TeamBalance {
  const owed = orders.reduce((sum, o) => sum + toAgorot(o.owed), 0);
  const paid = orders.reduce((sum, o) => sum + toAgorot(o.paid), 0) + toAgorot(onAccountIls);
  let credit = toAgorot(onAccountIls) + orders.reduce((sum, o) => sum + Math.max(0, toAgorot(o.paid) - toAgorot(o.owed)), 0);

  const owing = orders
    .map((o) => ({ ...o, leftA: toAgorot(o.owed) - toAgorot(o.paid), days: daysSince(o.approvedAt, now) }))
    .filter((o) => o.leftA > 0)
    .sort((a, b) => b.days - a.days || a.number - b.number);

  const ageing: Record<AgeingBucket, number> = { "0-30": 0, "31-60": 0, "60+": 0 };
  const open: TeamBalance["open"] = [];
  for (const o of owing) {
    const used = Math.min(credit, o.leftA);
    credit -= used;
    const left = o.leftA - used;
    if (left <= 0) continue;
    ageing[ageingBucket(o.days)] += left;
    open.push({ orderId: o.orderId, number: o.number, left: fromAgorot(left), days: o.days });
  }
  return {
    owed: fromAgorot(owed),
    paid: fromAgorot(paid),
    balance: fromAgorot(owed - paid),
    ageing: { "0-30": fromAgorot(ageing["0-30"]), "31-60": fromAgorot(ageing["31-60"]), "60+": fromAgorot(ageing["60+"]) },
    open,
    oldestDays: open.length ? open[0].days : null,
  };
}

/** The "יתרות" view's order: every team that owes, oldest debt first, then the larger one. */
export function owingFirst<T extends { balance: TeamBalance }>(teams: T[]): T[] {
  return teams
    .filter((t) => t.balance.balance > 0 && t.balance.open.length > 0)
    .sort((a, b) => (b.balance.oldestDays ?? 0) - (a.balance.oldestDays ?? 0) || b.balance.balance - a.balance.balance);
}

/** Today in Israel, "YYYY-MM-DD". */
export const israelToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

/** The "רישום תשלום" sheet's amount: what is left, as typed ("1250" or "1250.5"), or empty. */
export const defaultAmount = (left: number) => (left > 0 ? String(left) : "");

const amount = z
  .string()
  .trim()
  .transform((s) => s.replace(/[,\s₪]/g, ""))
  .pipe(z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, "סכום בשקלים, עד שתי ספרות אחרי הנקודה"))
  .transform(Number)
  .pipe(z.number().positive("הסכום צריך להיות גדול מ-0").max(10_000_000));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null);

export const paymentInput = z.object({
  teamId: z.uuid(),
  /** Empty for a payment on account. */
  orderId: z.union([z.literal("").transform(() => null), z.uuid()]),
  amount,
  paidAt: z.iso.date("תאריך לא תקין"),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(100),
  note: optionalText(500),
});
export type PaymentInput = z.infer<typeof paymentInput>;

/** The sheet's fields, checked: Hebrew errors, a date no later than tomorrow (Israel time). */
export function parsePayment(form: Record<string, unknown>, now = new Date()): { ok: true; value: PaymentInput } | { ok: false; error: string } {
  const parsed = paymentInput.safeParse({
    teamId: form.teamId ?? "",
    orderId: form.orderId ?? "",
    amount: form.amount ?? "",
    paidAt: form.paidAt ?? "",
    method: form.method ?? "",
    reference: form.reference ?? "",
    note: form.note ?? "",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    const byField: Record<string, string> = {
      amount: issue?.message && /[א-ת]/.test(issue.message) ? issue.message : "סכום לא תקין",
      paidAt: "תאריך לא תקין",
      method: "בחרו אמצעי תשלום",
      reference: "האסמכתא ארוכה מדי",
      note: "ההערה ארוכה מדי",
    };
    return { ok: false, error: byField[field] ?? "הפרטים לא תקינים" };
  }
  const tomorrow = israelToday(new Date(now.getTime() + DAY));
  if (parsed.data.paidAt > tomorrow) return { ok: false, error: "תאריך התשלום עוד לא הגיע" };
  return { ok: true, value: parsed.data };
}

export const voidInput = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(2, "צריך לכתוב למה מבטלים").max(500),
});

/** One CSV row for the bookkeeper. */
export type PaymentExportRow = {
  paidAt: string;
  team: string;
  orderNumber: number | null;
  amountIls: string | number;
  method: PaymentMethod;
  reference: string | null;
  documentNumber: string | null;
  note: string | null;
  voidedAt: Date | string | null;
  voidReason: string | null;
};

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const PAYMENTS_CSV_HEADER = ["תאריך", "קבוצה", "הזמנה", "סכום ₪", "אמצעי תשלום", "אסמכתא", "מספר מסמך", "הערה", "בוטל", "סיבת ביטול"];

/**
 * The payments CSV: date, team, order, amount, method, reference and document number, then
 * the note and whether it was voided (a voided row stays in the file, marked, so the books
 * match). Starts with a BOM so Excel reads the Hebrew.
 */
export function paymentsCsv(rows: PaymentExportRow[]): string {
  const lines = [PAYMENTS_CSV_HEADER, ...rows.map((r) => [
    r.paidAt,
    r.team,
    r.orderNumber,
    Number(r.amountIls).toFixed(2),
    METHOD_LABEL[r.method],
    r.reference,
    r.documentNumber,
    r.note,
    r.voidedAt ? "כן" : "",
    r.voidReason,
  ])];
  return `﻿${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** The order delete's guard (Nov 17 + P1): blocked while any payment on the order isn't voided. */
export function deleteBlockedByPayments(payments: PaymentLike[]): string | null {
  const live = payments.filter((p) => !p.voidedAt);
  if (live.length === 0) return null;
  const total = paidTotal(live);
  return live.length === 1
    ? `על ההזמנה רשום תשלום של ${formatIls(total, { agorot: true })}. כדי למחוק אותה צריך קודם לבטל אותו בחלק ״תשלום״.`
    : `על ההזמנה רשומים ${live.length} תשלומים, ${formatIls(total, { agorot: true })}. כדי למחוק אותה צריך קודם לבטל אותם בחלק ״תשלום״.`;
}
