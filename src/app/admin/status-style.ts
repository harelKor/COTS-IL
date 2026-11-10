import type { LineStatus, OrderStatusKey } from "@/domain/order-status";

/** Each status in its own colour (S10A): a soft fill, its text, and a strong edge for the filter box. */
export const STATUS_STYLE: Record<OrderStatusKey, { chip: string; box: string; edge: string }> = {
  awaiting_quote: { chip: "bg-warning/10 text-warning", box: "bg-warning/8 text-warning", edge: "border-warning" },
  quote_sent: { chip: "bg-brand-soft text-brand-strong", box: "bg-brand-soft/60 text-brand-strong", edge: "border-brand" },
  to_order: { chip: "bg-violet/10 text-violet", box: "bg-violet/8 text-violet", edge: "border-violet" },
  ordered: { chip: "bg-brand/10 text-brand", box: "bg-brand/8 text-brand", edge: "border-brand" },
  to_warehouse: { chip: "bg-brand/10 text-brand", box: "bg-brand/8 text-brand", edge: "border-brand" },
  at_warehouse: { chip: "bg-teal/10 text-teal", box: "bg-teal/8 text-teal", edge: "border-teal" },
  to_team: { chip: "bg-indigo/10 text-indigo", box: "bg-indigo/8 text-indigo", edge: "border-indigo" },
  delivered: { chip: "bg-success/10 text-success", box: "bg-success/8 text-success", edge: "border-success" },
  rejected: { chip: "bg-subtle text-muted", box: "bg-subtle text-muted", edge: "border-line" },
  cancelled: { chip: "bg-subtle text-muted", box: "bg-subtle text-muted", edge: "border-line" },
};

export const LINE_STYLE: Record<LineStatus, string> = {
  to_order: STATUS_STYLE.to_order.chip,
  ordered: STATUS_STYLE.ordered.chip,
  to_warehouse: STATUS_STYLE.to_warehouse.chip,
  at_warehouse: STATUS_STYLE.at_warehouse.chip,
  to_team: STATUS_STYLE.to_team.chip,
  delivered: STATUS_STYLE.delivered.chip,
};
