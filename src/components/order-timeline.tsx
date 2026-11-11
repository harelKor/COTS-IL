import { Check } from "lucide-react";
import { Ltr } from "@/components/ltr";
import { formatShortDate } from "@/components/quote-view";
import { orderTimeline, teamStepLabel, type OrderStatusKey, type OrderStep, type StepDates } from "@/domain/order-status";

const STAGE_TONE: Partial<Record<OrderStatusKey, string>> = {
  quote_sent: "bg-warning/15 text-warning",
  delivered: "bg-success/15 text-success",
  rejected: "bg-danger/10 text-danger",
  cancelled: "bg-subtle text-muted",
};

/** The order's stage in the team's words, as a small badge. */
export function StageBadge({ stage, pickup = false }: { stage: OrderStatusKey; pickup?: boolean }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-caption font-medium whitespace-nowrap ${STAGE_TONE[stage] ?? "bg-brand-soft text-brand-strong"}`}>
      {teamStepLabel(stage, pickup)}
    </span>
  );
}

/** Where the order is: each step done, current or still ahead, with the date it was reached. */
export function OrderTimeline({ stage, stoppedAt, dates, pickup = false }: { stage: OrderStatusKey; stoppedAt?: OrderStep; dates?: StepDates; pickup?: boolean }) {
  const steps = orderTimeline(stage, stoppedAt, dates, pickup);
  const stopped = stage === "rejected" || stage === "cancelled";
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:gap-2" aria-label="מצב ההזמנה">
      {steps.map((step) => (
        <li key={step.step} aria-current={step.state === "current" ? "step" : undefined} className="flex items-center gap-2 py-1 sm:flex-1 sm:flex-col sm:items-start">
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-full text-caption ${
              step.state === "done" ? "bg-success text-white" : step.state === "current" ? (stopped ? "bg-danger text-white" : "bg-brand text-white") : "bg-subtle text-muted"
            }`}
          >
            {step.state === "done" ? <Check size={14} aria-hidden /> : null}
          </span>
          <span className="flex flex-col">
            <span className={`text-caption ${step.state === "ahead" ? "text-muted" : "font-medium"}`}>
              {step.state === "current" && stopped ? teamStepLabel(stage) : step.label}
            </span>
            {step.date && (
              <span className="text-caption text-muted">
                <Ltr>{formatShortDate(step.date)}</Ltr>
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
