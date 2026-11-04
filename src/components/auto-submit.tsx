"use client";

import type { ComponentProps } from "react";

const fieldClass = "rounded-md border border-line bg-surface px-3 py-2 text-sm";

/** Applies the filter as soon as it changes. Without JavaScript the form's submit button still works. */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <select {...props} className={fieldClass} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

export function AutoSubmitCheckbox(props: ComponentProps<"input">) {
  return <input {...props} type="checkbox" onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
