import type { ComponentProps, ReactNode } from "react";

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
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="text-xs text-muted">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} className="text-xs text-danger">
          {e}
        </p>
      ))}
    </div>
  );
}

export function Input(props: ComponentProps<"input">) {
  return (
    <input
      id={props.name}
      {...props}
      className="h-10 rounded-md border border-line bg-surface px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
    />
  );
}

export function Select(props: ComponentProps<"select">) {
  return (
    <select
      id={props.name}
      {...props}
      className="h-10 rounded-md border border-line bg-surface px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
    />
  );
}

export function Button({ variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-strong",
    ghost: "border border-line bg-surface hover:bg-subtle",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition disabled:opacity-60 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function Alert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "info" }) {
  const styles = tone === "danger" ? "border-danger/30 bg-danger/5 text-danger" : "border-brand/30 bg-brand/5";
  return <div className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}
