import type { AdminLineStage, AdminStatus } from "@/domain/admin-orders";

/** Each admin status in its own colour (S10A): a soft fill, its text, and a strong edge for the filter box. */
export const STATUS_STYLE: Record<AdminStatus, { chip: string; box: string; edge: string }> = {
  review: { chip: "bg-warning/10 text-warning", box: "bg-warning/8 text-warning", edge: "border-warning" },
  team: { chip: "bg-brand-soft text-brand-strong", box: "bg-brand-soft/60 text-brand-strong", edge: "border-brand" },
  to_send: { chip: "bg-violet/10 text-violet", box: "bg-violet/8 text-violet", edge: "border-violet" },
  sent: { chip: "bg-brand/10 text-brand", box: "bg-brand/8 text-brand", edge: "border-brand" },
  warehouse: { chip: "bg-teal/10 text-teal", box: "bg-teal/8 text-teal", edge: "border-teal" },
  out: { chip: "bg-indigo/10 text-indigo", box: "bg-indigo/8 text-indigo", edge: "border-indigo" },
  done: { chip: "bg-success/10 text-success", box: "bg-success/8 text-success", edge: "border-success" },
};

export const LINE_STYLE: Record<AdminLineStage, string> = {
  to_send: STATUS_STYLE.to_send.chip,
  sent: STATUS_STYLE.sent.chip,
  warehouse: STATUS_STYLE.warehouse.chip,
  out: STATUS_STYLE.out.chip,
  done: STATUS_STYLE.done.chip,
};
