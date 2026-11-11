import type { OrderStatus } from "./orders";

/**
 * Where an order is: one function for every screen (S13). The admin's list and card, the
 * team's badge, stepper and line chips all read it, so they can't disagree. Nothing extra
 * is stored: it comes from the stored order status and the purchasing records.
 */

/** One approved order line, in units. */
export type LineFacts = {
  supplierName: string;
  /** In the approved quote. */
  quoted: number;
  /** On a supplier order marked ordered. */
  ordered: number;
  /** Some of it is on a shipment that hasn't been received yet. */
  inTransit: boolean;
  /** Received at the warehouse and set aside for this line. */
  allocated: number;
  /** On a delivery note that isn't confirmed yet. */
  prepared: number;
  /** On a confirmed delivery. */
  delivered: number;
};

/** A line's steps, in order. */
export const LINE_STATUSES = ["to_order", "ordered", "to_warehouse", "at_warehouse", "to_team", "delivered"] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

/** The order's steps, in order, then the two ways it can stop. */
export const ORDER_STEPS = ["awaiting_quote", "quote_sent", ...LINE_STATUSES] as const;
export type OrderStep = (typeof ORDER_STEPS)[number];
export type OrderStatusKey = OrderStep | "rejected" | "cancelled";
export const ORDER_STATUS_KEYS: OrderStatusKey[] = [...ORDER_STEPS, "rejected", "cancelled"];

/**
 * Each status in the admin's words and the team's. Both say the same thing, and none
 * is a bare "נשלחה": it always says where to.
 */
export const STATUS_LABELS: Record<OrderStatusKey, { admin: string; team: string }> = {
  awaiting_quote: { admin: "מחכה להצעה שלך", team: "מחכה להצעת מחיר" },
  quote_sent: { admin: "מחכה לאישור הקבוצה", team: "הצעת המחיר מחכה לאישורכם" },
  to_order: { admin: "אושרה, להזמין מהספק", team: "אושרה, בהזמנה מהספקים" },
  ordered: { admin: "הוזמנה מהספק", team: "הוזמנה מהספק" },
  to_warehouse: { admin: "בדרך למחסן", team: "בדרך למחסן בישראל" },
  at_warehouse: { admin: "במחסן", team: "הגיעה למחסן בישראל" },
  to_team: { admin: "מוכנה למסירה", team: "מוכנה למסירה" },
  delivered: { admin: "נמסרה", team: "נמסרה" },
  rejected: { admin: "נדחתה", team: "נדחתה" },
  cancelled: { admin: "בוטלה", team: "בוטלה" },
};

/** A line's chip: the same words on both sides. */
export const LINE_LABELS: Record<LineStatus, string> = {
  to_order: "ממתינה להזמנה מהספק",
  ordered: "הוזמנה מהספק",
  to_warehouse: "בדרך למחסן",
  at_warehouse: "במחסן",
  to_team: "מוכנה למסירה",
  delivered: "נמסרה",
};

/** What the lines past the earliest one have done, for "3 מתוך 5 פריטים …". */
const PAST_WORDS: Record<LineStatus, string> = {
  to_order: "כבר הוזמנו מהספק",
  ordered: "כבר יצאו מהספק",
  to_warehouse: "כבר הגיעו למחסן",
  at_warehouse: "כבר מוכנים למסירה",
  to_team: "כבר נמסרו",
  delivered: "נמסרו",
};

export function lineStatus(l: LineFacts): LineStatus {
  if (l.quoted <= 0 || l.delivered >= l.quoted) return "delivered";
  if (l.prepared + l.delivered >= l.quoted) return "to_team";
  if (l.allocated >= l.quoted) return "at_warehouse";
  if (l.ordered < l.quoted) return "to_order";
  return l.inTransit ? "to_warehouse" : "ordered";
}

export type OrderView = {
  status: OrderStatusKey;
  /** Set when the lines are at different steps, e.g. "3 מתוך 5 פריטים כבר הוזמנו מהספק". */
  progress: string | null;
  /** Set when the order spans suppliers and only some are ordered, e.g. "WCP הוזמן, AndyMark ממתין". */
  vendors: string | null;
};

/** The order is at its earliest line, so nothing still waiting is ever hidden. */
export function orderStatus(stored: OrderStatus, lines: LineFacts[]): OrderView {
  if (stored === "submitted") return { status: "awaiting_quote", progress: null, vendors: null };
  if (stored === "quote_sent") return { status: "quote_sent", progress: null, vendors: null };
  if (stored === "rejected" || stored === "cancelled") return { status: stored, progress: null, vendors: null };

  const live = lines.filter((l) => l.quoted > 0);
  if (live.length === 0) return { status: "to_order", progress: null, vendors: null };
  const steps = live.map(lineStatus);
  const at = (s: LineStatus) => LINE_STATUSES.indexOf(s);
  const earliest = steps.reduce<LineStatus>((min, s) => (at(s) < at(min) ? s : min), "delivered");

  const past = steps.filter((s) => at(s) > at(earliest)).length;
  const progress = past > 0 ? `${past} מתוך ${live.length} פריטים ${PAST_WORDS[earliest]}` : null;

  const byVendor = new Map<string, boolean>();
  for (const l of live) byVendor.set(l.supplierName, (byVendor.get(l.supplierName) ?? true) && l.ordered >= l.quoted);
  const states = [...byVendor.values()];
  const vendors =
    byVendor.size > 1 && states.some(Boolean) && states.some((s) => !s)
      ? [...byVendor].map(([name, done]) => `${name} ${done ? "הוזמן" : "ממתין"}`).join(", ")
      : null;

  return { status: earliest, progress, vendors };
}

/** Delivered, rejected or cancelled: nothing more happens to it. */
export function isFinished(status: OrderStatusKey) {
  return status === "delivered" || status === "rejected" || status === "cancelled";
}

/** When each step was first reached, from the order, quote, purchasing and delivery records. */
export type StepDates = Partial<Record<OrderStep, Date>>;

/** The team's word for a step: for a pickup order, "ready to hand over" is "ready for pickup". */
export function teamStepLabel(step: OrderStatusKey, pickup = false) {
  if (step === "to_team") return pickup ? "מוכנה לאיסוף" : "במשלוח אליכם";
  return STATUS_LABELS[step].team;
}

/**
 * The team's stepper: each step done, current or still ahead, with the date it was
 * reached when the records have one. A stopped order shows where it stopped.
 */
export function orderTimeline(status: OrderStatusKey, stoppedAt: OrderStep = "awaiting_quote", dates: StepDates = {}, pickup = false) {
  const reached = ORDER_STEPS.indexOf(status === "rejected" || status === "cancelled" ? stoppedAt : status);
  return ORDER_STEPS.map((s, i) => {
    const state = i < reached ? ("done" as const) : i === reached ? ("current" as const) : ("ahead" as const);
    return { step: s, label: teamStepLabel(s, pickup), state, date: state === "ahead" ? null : (dates[s] ?? null) };
  });
}

/** The steps a unit goes through after the quote is approved (S13 task 3). */
export type Advance = "ship" | "receive" | "prepare_delivery" | "deliver";

const ADVANCE_ERRORS: Record<Advance, string> = {
  ship: "אי אפשר לשלוח יותר ממה שהוזמן מהספק ונותר",
  receive: "אי אפשר לקלוט יותר ממה שנשלח ונותר",
  prepare_delivery: "אפשר למסור רק מה שהגיע למחסן ונותר",
  deliver: "אפשר לסמן כנמסר רק מה שיש בתעודת משלוח",
};

/**
 * Whether `qty` more units may take a step. `reached` is how many units got through the
 * step before (ordered for "ship", shipped for "receive", received and set aside for
 * "prepare_delivery", on the note for "deliver") and `done` how many already took this
 * one. Steps can't be skipped: no step has units the one before didn't pass on.
 */
export function canAdvance(step: Advance, { reached, done }: { reached: number; done: number }, qty: number): string | null {
  if (!Number.isInteger(qty) || qty < 0) return "כמות לא תקינה";
  return done + qty > reached ? ADVANCE_ERRORS[step] : null;
}
