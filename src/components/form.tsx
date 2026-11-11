import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";

/** A label, one control, and its hint or errors. The control is told which message describes it. */
export function Field({
  label,
  name,
  errors,
  hint,
  children,
}: {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
  children: ReactNode;
}) {
  const hasErrors = !!errors?.length;
  const msgId = hasErrors ? `${name}-error` : hint ? `${name}-hint` : undefined;
  const control =
    msgId && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-describedby": msgId,
          ...(hasErrors ? { "aria-invalid": true } : {}),
        })
      : children;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-callout font-medium">
        {label}
      </label>
      {control}
      {hint && !hasErrors && (
        <p id={msgId} className="text-caption text-muted">
          {hint}
        </p>
      )}
      {hasErrors && (
        <div id={msgId} role="alert">
          {errors!.map((e) => (
            <p key={e} className="text-caption text-danger">
              {e}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** 44px tall, soft blue fill, a brand ring on focus. */
export const fieldClass =
  "h-11 rounded-xl border border-transparent bg-subtle px-3 text-base outline-none transition-colors focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/20 aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input id={props.name} {...props} className={`${fieldClass} ${className ?? ""}`} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select id={props.name} {...props} className={`${fieldClass} ${className ?? ""}`} />;
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/**
 * The one button. primary = the screen's single solid action (`.btn-brand`); secondary = soft white pill;
 * ghost = text only; danger = destructive, outlined in red so it never competes with the primary.
 */
export function buttonClass(variant: ButtonVariant = "secondary", extra = "") {
  const styles = {
    primary: "btn-brand font-semibold",
    secondary: "btn-soft font-medium",
    ghost: "font-medium text-brand hover:bg-subtle",
    danger: "font-medium text-danger ring-1 ring-danger/30 ring-inset hover:bg-danger/5",
  }[variant];
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-callout transition disabled:pointer-events-none disabled:opacity-50 ${styles} ${extra}`;
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

/** The one card: white-to-ice fade, blue hairline, soft cobalt shadow. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={`card-surface p-4 sm:p-5 ${className ?? ""}`} />;
}

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

/** A status tag: small, square-ish and flat, so it never reads as a button. */
export function StatusTag({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const styles = {
    neutral: "bg-subtle text-muted",
    brand: "bg-brand-soft text-brand-strong",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-caption font-medium whitespace-nowrap ${styles} ${className ?? ""}`}>
      {children}
    </span>
  );
}

export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "info" }) {
  const styles = tone === "danger" ? "border-danger/30 bg-danger/5 text-danger" : "border-brand/30 bg-brand/5";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-3 py-2 text-callout ${styles}`}>
      {children}
    </div>
  );
}
