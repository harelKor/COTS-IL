"use client";

import { Search } from "lucide-react";
import { useSyncExternalStore } from "react";
import { openSearch, serverShortcut, shortcutLabel } from "./search-panel";

const noSubscribe = () => () => {};

/** A quiet way into the search panel from the home hero, with its keyboard shortcut. */
export function SearchKeyButton({ className = "" }: { className?: string }) {
  const shortcut = useSyncExternalStore(noSubscribe, shortcutLabel, serverShortcut);
  return (
    <button
      type="button"
      onClick={openSearch}
      className={`scene-search-key min-h-11 items-center gap-2 rounded-xl px-3 text-caption font-medium ${className}`}
    >
      <Search size={20} strokeWidth={1.75} aria-hidden />
      חיפוש חלק
      <kbd dir="ltr">{shortcut}</kbd>
    </button>
  );
}
