import { Check } from "lucide-react";
import { Ltr } from "@/components/ltr";
import { formatDateTime } from "@/components/orders";
import { OrderStatusTag } from "@/components/order-status-tag";
import { compactTimeline, statusTone, type OrderStatusKey, type OrderStep, type StepDates } from "@/domain/order-status";

/** The order's stage in the team's words, as a small status tag. */
export function StageBadge({ stage, pickup = false }: { stage: OrderStatusKey; pickup?: boolean }) {
  return <OrderStatusTag status={stage} audience="team" pickup={pickup} />;
}

const DOT: Record<ReturnType<typeof statusTone>, string> = {
  neutral: "bg-slate text-white",
  us: "bg-brand text-white",
  team: "bg-warning text-white",
  done: "bg-success text-white",
  problem: "bg-danger text-white",
};

const When = ({ date }: { date: Date | null }) =>
  date ? (
    <span className="text-caption text-muted">
      <Ltr>{formatDateTime(date)}</Ltr>
    </span>
  ) : null;

/**
 * Where the order is (C-29): the steps already done fold into one line, the current step
 * stands out with the date and time it was reached, and the next step shows what comes.
 */
export function OrderTimeline({ stage, stoppedAt, dates, pickup = false }: { stage: OrderStatusKey; stoppedAt?: OrderStep; dates?: StepDates; pickup?: boolean }) {
  const { done, current, next, stopped } = compactTimeline(stage, stoppedAt, dates, pickup);
  const tone = stopped ? statusTone(stage) : stage === "delivered" ? "done" : statusTone(current.step);
  return (
    <div className="flex flex-col gap-3" aria-label="מצב ההזמנה">
      {done.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-callout text-muted">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success text-white">
              <Check size={14} aria-hidden />
            </span>
            {done.length === 1 ? "שלב אחד הושלם" : `${done.length} שלבים הושלמו`}
            <span aria-hidden className="text-caption group-open:rotate-180">▾</span>
          </summary>
          <ol className="ms-3 flex flex-col border-s border-line ps-5">
            {done.map((step) => (
              <li key={step.step} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1">
                <span className="text-callout">{step.label}</span>
                <When date={step.date} />
              </li>
            ))}
          </ol>
        </details>
      )}
      <div aria-current="step" className="flex items-start gap-3">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${DOT[tone]}`}>
          {/* theme-independent: a white dot on the stage's deep fill. */}
          {stage === "delivered" ? <Check size={18} aria-hidden /> : <span className="size-2.5 rounded-full bg-white" aria-hidden />}
        </span>
        <span className="flex flex-col">
          <span className="text-section font-semibold tracking-[-0.02em]">{current.label}</span>
          {current.date && (
            <span className="text-caption text-muted">
              מאז <Ltr>{formatDateTime(current.date)}</Ltr>
            </span>
          )}
        </span>
      </div>
      {next && (
        <p className="ms-11 text-callout text-muted">
          השלב הבא: <span className="text-foreground">{next.label}</span>
        </p>
      )}
    </div>
  );
}
