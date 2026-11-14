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
 * Whose move it is, which picks the status colour on every screen (D-07): nothing to do
 * but wait on a supplier or courier, the Israeli supplier's move, the team's move, done,
 * or stopped.
 */
export type StatusTone = "neutral" | "us" | "team" | "done" | "problem";

export type Audience = "admin" | "team";

/**
 * The status dictionary (T4): each status once, in the admin's words and the team's, with
 * its tone. Every screen and email reads its words from here, through `statusLabel`, so one
 * order never has two names. None is a bare "נשלחה": it always says where to. The team's
 * word for "ready" depends on pickup or delivery (`teamPickup`).
 */
export const STATUS: Record<OrderStatusKey, { admin: string; team: string; teamPickup?: string; tone: StatusTone }> = {
  awaiting_quote: { admin: "מחכה להצעה שלך", team: "מחכה להצעת מחיר", tone: "us" },
  quote_sent: { admin: "מחכה לאישור הקבוצה", team: "ההצעה מחכה לאישורכם", tone: "team" },
  to_order: { admin: "אושרה, להזמין מהספק", team: "אושרה, בהזמנה מהספקים", tone: "us" },
  ordered: { admin: "הוזמנה מהספק", team: "הוזמנה מהספקים", tone: "neutral" },
  to_warehouse: { admin: "בדרך למחסן", team: "בדרך למחסן בישראל", tone: "neutral" },
  at_warehouse: { admin: "במחסן", team: "הגיעה למחסן בישראל", tone: "us" },
  to_team: { admin: "מוכנה למסירה", team: "מוכנה למשלוח אליכם", teamPickup: "מוכנה לאיסוף", tone: "us" },
  delivered: { admin: "נמסרה", team: "נמסרה", tone: "done" },
  rejected: { admin: "נדחתה", team: "נדחתה", tone: "problem" },
  cancelled: { admin: "בוטלה", team: "בוטלה", tone: "neutral" },
};

/** A status in one audience's words. For the team, `pickup` picks "מוכנה לאיסוף" over the delivery wording. */
export function statusLabel(status: OrderStatusKey, audience: Audience, pickup = false): string {
  const entry = STATUS[status];
  if (audience === "admin") return entry.admin;
  return (pickup && entry.teamPickup) || entry.team;
}

export const statusTone = (status: OrderStatusKey): StatusTone => STATUS[status].tone;

/** A line's chip: the order's word for the same step, except a line still waiting to be ordered. */
export function lineLabel(status: LineStatus, audience: Audience, pickup = false): string {
  if (status === "to_order") return "ממתינה להזמנה מהספק";
  return statusLabel(status, audience, pickup);
}

/** A delivery note's state is the order's "ready" until it is confirmed, then "delivered". */
export function deliveryLabel(status: "prepared" | "delivered", audience: Audience, pickup = false): string {
  return statusLabel(status === "delivered" ? "delivered" : "to_team", audience, pickup);
}

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

/**
 * The team's stepper: each step done, current or still ahead, with the date it was
 * reached when the records have one. A stopped order shows where it stopped.
 */
export function orderTimeline(status: OrderStatusKey, stoppedAt: OrderStep = "awaiting_quote", dates: StepDates = {}, pickup = false) {
  const reached = ORDER_STEPS.indexOf(status === "rejected" || status === "cancelled" ? stoppedAt : status);
  return ORDER_STEPS.map((s, i) => {
    const state = i < reached ? ("done" as const) : i === reached ? ("current" as const) : ("ahead" as const);
    return { step: s, label: statusLabel(s, "team", pickup), state, date: state === "ahead" ? null : (dates[s] ?? null) };
  });
}

/**
 * The team's compact timeline (C-29): the steps already done (shown folded), the current
 * one (shown large) and the one after it. A stopped order's current step is where it
 * stopped, labelled with how it stopped, and has nothing after it.
 */
export function compactTimeline(status: OrderStatusKey, stoppedAt: OrderStep = "awaiting_quote", dates: StepDates = {}, pickup = false) {
  const steps = orderTimeline(status, stoppedAt, dates, pickup);
  const stopped = status === "rejected" || status === "cancelled";
  const at = steps.findIndex((s) => s.state === "current");
  const current = { ...steps[at], label: stopped ? statusLabel(status, "team") : steps[at].label };
  return { done: steps.slice(0, at), current, next: stopped ? null : (steps[at + 1] ?? null), stopped };
}

/**
 * A supplier shipment's state, worked out from its units and never stored (A-03): nothing
 * received yet, some of it, or all of it, which closes the shipment. Damaged units count
 * as received here; the replacement goes on a new shipment.
 */
export type ShipmentStatus = "in_transit" | "partly_received" | "received";

export const SHIPMENT_LABELS: Record<ShipmentStatus, string> = {
  in_transit: "בדרך",
  partly_received: "התקבל בחלקו",
  received: "התקבל",
};

export const SHIPMENT_TONES: Record<ShipmentStatus, StatusTone> = { in_transit: "neutral", partly_received: "us", received: "done" };

export function shipmentStatus({ shipped, received }: { shipped: number; received: number }): ShipmentStatus {
  if (received <= 0) return "in_transit";
  return received >= shipped ? "received" : "partly_received";
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
