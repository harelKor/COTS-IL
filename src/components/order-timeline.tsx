import { Check } from "lucide-react";
import { ORDER_STAGE_LABELS, orderTimeline, type OrderStage } from "@/domain/order-stage";

const STAGE_TONE: Partial<Record<OrderStage, string>> = {
  quoted: "bg-warning/15 text-warning",
  delivered: "bg-success/15 text-success",
  rejected: "bg-danger/10 text-danger",
  cancelled: "bg-subtle text-muted",
};

/** The order's stage in the team's words, as a small badge. */
export function StageBadge({ stage }: { stage: OrderStage }) {
  return <span className={`rounded-full px-3 py-1 text-caption ${STAGE_TONE[stage] ?? "bg-brand/10 text-brand"}`}>{ORDER_STAGE_LABELS[stage]}</span>;
}

/** Where the order is: each step done, current or still ahead. */
export function OrderTimeline({ stage, stoppedAt }: { stage: OrderStage; stoppedAt?: OrderStage }) {
  const steps = orderTimeline(stage, stoppedAt);
  const stopped = stage === "rejected" || stage === "cancelled";
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:gap-2" aria-label="מצב ההזמנה">
      {steps.map((step) => (
        <li key={step.stage} aria-current={step.state === "current" ? "step" : undefined} className="flex items-center gap-2 py-1 sm:flex-1 sm:flex-col sm:items-start">
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
              step.state === "done" ? "bg-success text-white" : step.state === "current" ? (stopped ? "bg-danger text-white" : "bg-brand text-white") : "bg-subtle text-muted"
            }`}
          >
            {step.state === "done" ? <Check size={14} aria-hidden /> : null}
          </span>
          <span className={`text-caption ${step.state === "ahead" ? "text-muted" : "font-medium"}`}>
            {step.state === "current" && stopped ? ORDER_STAGE_LABELS[stage] : step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
