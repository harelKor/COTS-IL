"use client";

import { Search, X } from "lucide-react";

/** The field look shared by the option picker and the filter panel: 44px, rounded, on the subtle fill. */
export const fieldClass =
  "flex min-h-11 w-full items-center gap-2 rounded-xl bg-subtle/70 ps-3 text-callout transition-colors duration-150 hover:bg-subtle focus-within:ring-2 focus-within:ring-brand/60";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Shows an X that empties the field (when it has text). */
  onClear?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
};

/**
 * A search field with its magnifier and an optional clear (X): the product page's option picker
 * sheet, a long filter list and the catalog panel's search all use it (CF2).
 */
export function SearchField({ onClear, inputRef, className = "", value, ...input }: Props) {
  const filled = typeof value === "string" ? value.length > 0 : value !== undefined && value !== null;
  return (
    <div className={`${fieldClass} ${onClear ? "pe-0" : "pe-3"} ${className}`}>
      <Search size={18} aria-hidden className="shrink-0 text-muted" />
      <input
        ref={inputRef}
        value={value}
        autoComplete="off"
        spellCheck={false}
        {...input}
        className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {onClear && filled && (
        <button type="button" onClick={onClear} aria-label="ניקוי החיפוש" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-foreground">
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
