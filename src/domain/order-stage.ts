import { lineStage, type LineProgress } from "./logistics";
import type { OrderStatus } from "./orders";

/**
 * Where an order is, in the team's words (docs/REDESIGN.md, "Team account").
 * Worked out from the stored order status and the purchasing records, so it
 * can't drift from them: nothing extra is stored.
 */
export const ORDER_STAGES = ["requested", "quoted", "approved", "ordered", "in_transit", "delivered"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number] | "rejected" | "cancelled";

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  requested: "נשלחה בקשה להצעת מחיר",
  quoted: "התקבלה הצעת מחיר",
  approved: "ההצעה אושרה",
  ordered: "הוזמן מהספקים",
  in_transit: "בדרך",
  delivered: "נמסר",
  rejected: "נדחתה",
  cancelled: "בוטלה",
};

export function orderStage(status: OrderStatus, lines: LineProgress[]): OrderStage {
  if (status === "rejected" || status === "cancelled") return status;
  if (status === "submitted") return "requested";
  if (status === "quote_sent") return "quoted";
  const stages = lines.map(lineStage);
  if (stages.length > 0 && stages.every((s) => s === "delivered")) return "delivered";
  if (stages.some((s) => s === "in_transit" || s === "allocated" || s === "delivered")) return "in_transit";
  if (stages.some((s) => s === "ordered")) return "ordered";
  return "approved";
}

/** The timeline's steps, each done, current or still ahead. A stopped order shows where it stopped. */
export function orderTimeline(stage: OrderStage, stoppedAt: OrderStage = "requested") {
  const reached = stage === "rejected" || stage === "cancelled" ? ORDER_STAGES.indexOf(stoppedAt as (typeof ORDER_STAGES)[number]) : ORDER_STAGES.indexOf(stage);
  return ORDER_STAGES.map((s, i) => ({
    stage: s,
    label: ORDER_STAGE_LABELS[s],
    state: i < reached ? ("done" as const) : i === reached ? ("current" as const) : ("ahead" as const),
  }));
}
